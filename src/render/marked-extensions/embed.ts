/*
* marked extension for embed:
  - image
  - excalidraw
  - note embedded
  - pdf plus, crop

  credits to Sun BooShi, author of note-to-mp plugin
  
 */

import { MarkedExtension, Token, Tokens } from "marked";
import { TAbstractFile, TFile } from "obsidian";
import { ObsidianMarkdownRenderer } from "../markdown-render";
import { WeWriteMarkedExtension } from "./extension";
import { $t } from "src/lang/i18n";
import matter from "gray-matter";

declare module "obsidian" {
	interface Vault {
		config: {
			attachmentFolderPath: string;
			newLinkFormat: string;
			useMarkdownLinks: boolean;
		};
	}
}

const EmbedRegex = /^!\[\[(.*?)\]\]/; //![[]]

function getEmbedType(link: string) {
	const reg_pdf_crop = /^pdf#page=(\d+)(&rect=.*?)$/;

	const sep = link.lastIndexOf("|");
	if (sep > 0) {
		link = link.substring(0, sep);
	}
	const index = link.lastIndexOf(".");
	if (index == -1) {
		return "note";
	}
	const ext = link.substring(index + 1);
	if (reg_pdf_crop.test(ext)) {
		return "pdf-crop";
	}
	// https://mmbiz.qpic.cn
	if (link.startsWith("https://mmbiz.qpic.cn/")|| link.startsWith("http://mmbiz.qpic.cn/")) {
		return "image";
	}
	switch (ext.toLocaleLowerCase()) {
		case "md":
			return "note";
		case "png":
		case "jpg":
		case "jpeg":
		case "gif":
		case "bmp":
			return "image";
		case "webp":
			return "webp";
		case "svg":
			return "svg";
		case "pdf":
			return "pdf";
		case "mp4":
		case "mov":
		case "avi":
		case "mkv":
		case "webm":
			return "video";
		case "mp3":
		case "m4a":
		case "aac":
		case "ogg":
		case "opus":
		case "flac":
		case "wma":
		case "wav":
		case "amr":
			return "voice";
		case "excalidraw":
			return "excalidraw";
		default:
			return "file";
	}
}

export class Embed extends WeWriteMarkedExtension {
	public static fileCache: Map<string, string> = new Map<string, string>();
	index: number = 0;
	videoIndex: number = 0;
	voiceIndex: number = 0;
	pdfCropIndex: number = 0;
	embedMarkdownIndex: number = 0;
	excalidrawIndex: number = 0;
	markdownEmbedIndex: number = 0;

	generateId() {
		this.index += 1;
		return `fid-${this.index}`;
	}

	async prepare() {
		this.videoIndex = 0;
		this.voiceIndex = 0;
		this.pdfCropIndex = 0;
		this.index = 0;
		this.embedMarkdownIndex = 0;
		this.excalidrawIndex = 0;
		this.markdownEmbedIndex = 0;
	}
	searchFile(originPath: string): TAbstractFile | null {
		const resolvedPath = this.resolvePath(originPath);
		const vault = this.plugin.app.vault;
		const attachmentFolderPath = vault.config.attachmentFolderPath || "";
		let localPath = resolvedPath;
		let file = null;

		file = vault.getFileByPath(resolvedPath);
		if (file) {
			return file;
		}

		file = vault.getFileByPath(originPath);
		if (file) {
			return file;
		}

		if (attachmentFolderPath != "") {
			localPath = attachmentFolderPath + "/" + originPath;
			file = vault.getFileByPath(localPath);
			if (file) {
				return file;
			}

			localPath = attachmentFolderPath + "/" + resolvedPath;
			file = vault.getFileByPath(localPath);
			if (file) {
				return file;
			}
		}

		const files = vault.getAllLoadedFiles();
		for (let f of files) {
			if (f.path.includes(originPath)) {
				return f;
			}
		}

		return null;
	}

	resolvePath(relativePath: string): string {
		const basePath = this.getActiveFileDir();
		if (!relativePath.includes("/")) {
			return relativePath;
		}
		const stack = basePath.split("/");
		const parts = relativePath.split("/");

		stack.pop();

		for (const part of parts) {
			if (part === ".") continue;
			if (part === "..") stack.pop();
			else stack.push(part);
		}
		return stack.join("/");
	}

	getActiveFileDir() {
		const af = this.plugin.app.workspace.getActiveFile();
		if (af == null) {
			return "";
		}
		const parts = af.path.split("/");
		parts.pop();
		if (parts.length == 0) {
			return "";
		}
		return parts.join("/");
	}
	getImagePath(path: string) {
		if (path.startsWith("http")) {
			return path;
		}
		const file = this.searchFile(path);

		if (file == null) {
			console.error("File not found" + path);
			return "";
		}
		if (file instanceof TFile) {
			const resPath = this.plugin.app.vault.getResourcePath(file);
			const info = {
				resUrl: resPath,
				filePath: file.path,
				url: null,
			};
			return resPath;
		} else {
			return "";
		}
	}

	isImage(file: string) {
		file = file.toLowerCase();
		return (
			file.endsWith(".png") ||
			file.endsWith(".jpg") ||
			file.endsWith(".jpeg") ||
			file.endsWith(".gif") ||
			file.endsWith(".bmp") ||
			file.endsWith(".webp")
		);
	}

	parseImageLink(link: string) {
		if (link.includes("|")) {
			const parts = link.split("|");
			const path = parts[0];
			if (!this.isImage(path)) return null;

			let width = null;
			let height = null;
			if (parts.length == 2) {
				const size = parts[1].toLowerCase().split("x");
				width = parseInt(size[0]);
				if (size.length == 2 && size[1] != "") {
					height = parseInt(size[1]);
				}
			}
			return { path, width, height };
		}
		// if (this.isImage(link)) {
		// 	return { path: link, width: null, height: null };
		// }
		// return null;
		return { path: link, width: null, height: null };
	}

	getHeaderLevel(line: string) {
		const match = line.trimStart().match(/^#{1,6}/);
		if (match) {
			return match[0].length;
		}
		return 0;
	}

	async getFileContent(
		file: TAbstractFile,
		header: string | null,
		block: string | null
	) {
		const content = await this.plugin.app.vault.adapter.read(file.path);
		if (header == null && block == null) {
			return content;
		}

		let result = "";
		const lines = content.split("\n");
		if (header) {
			let level = 0;
			let append = false;
			for (let line of lines) {
				if (append) {
					if (level == this.getHeaderLevel(line)) {
						break;
					}
					result += line + "\n";
					continue;
				}
				if (!line.trim().startsWith("#")) continue;
				const items = line.trim().split(" ");
				if (items.length != 2) continue;
				if (header.trim() != items[1].trim()) continue;
				if (this.getHeaderLevel(line)) {
					result += line + "\n";
					level = this.getHeaderLevel(line);
					append = true;
				}
			}
		}

		if (block) {
			let preline = "";
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (line.indexOf(block) >= 0) {
					result = line.replace(block, "");
					if (result.trim() == "") {
						for (let j = i - 1; j >= 0; j--) {
							const l = lines[j];
							if (l.trim() != "") {
								result = l;
								break;
							}
						}
					}
					break;
				}
				preline = line;
			}
		}
		return result;
	}

	parseFileLink(link: string) {
		const info = link.split("|")[0];
		const items = info.split("#");
		let path = items[0];
		let header = null;
		let block = null;
		if (items.length == 2) {
			if (items[1].startsWith("^")) {
				block = items[1];
			} else {
				header = items[1];
			}
		}
		return { path, head: header, block };
	}

	async renderFile(link: string) {
		let { path, head: header, block } = this.parseFileLink(link);
		let file = null;
		if (path === "") {
			file = this.plugin.app.workspace.getActiveFile();
		} else {
			if (!path.endsWith(".md")) {
				path = path + ".md";
			}
			file = this.searchFile(path);
		}

		if (file == null) {
			const msg = "File not found:" + path;
			console.error(msg);
			return;
		}

		const md = await this.getFileContent(file, header, block);
		const { data, content } = matter(md);
		const body = await this.marked.parse(content);
		return body;
	}

	parseLinkStyle(link: string) {
		let filename = "";
		let style = 'style="width:100%;height:100%"';
		let postion = "left";
		const postions = ["left", "center", "right"];
		if (link.includes("|")) {
			const items = link.split("|");
			filename = items[0];
			let size = "";
			if (items.length == 2) {
				if (postions.includes(items[1])) {
					postion = items[1];
				} else {
					size = items[1];
				}
			} else if (items.length == 3) {
				size = items[1];
				if (postions.includes(items[1])) {
					size = items[2];
					postion = items[1];
				} else {
					size = items[1];
					postion = items[2];
				}
			}
			if (size != "") {
				const sizes = size.split("x");
				if (sizes.length == 2) {
					style = `style="width:${sizes[0]}px;height:${sizes[1]}px;"`;
				} else {
					style = `style="width:${sizes[0]}px;"`;
				}
			}
		} else {
			filename = link;
		}
		return { filename, style, postion };
	}

	parseSVGLink(link: string) {
		let classname = "note-embed-svg-left";
		const postions = new Map<string, string>([
			["left", "note-embed-svg-left"],
			["center", "note-embed-svg-center"],
			["right", "note-embed-svg-right"],
		]);

		let { filename, style, postion } = this.parseLinkStyle(link);
		classname = postions.get(postion) || classname;

		return { filename, style, classname };
	}

	async renderSVGFile(filename: string, id: string) {
		const file = this.searchFile(filename);

		if (file == null) {
			const msg = $t("render.file-not-found") + file;
			console.error(msg);
			this.previewRender.updateElementByID(id, msg);
			return;
		}
		const content = await this.getFileContent(file, null, null);
		Embed.fileCache.set(filename, content);
		this.previewRender.updateElementByID(id, content);
	}

	markedExtension(): MarkedExtension {
		const regexImage = /!\[([^\]]*)\]\(([^)]+)\)/g;
		return {
			extensions: [
				{
					name: "Embed",
					level: "inline",
					start: (src: string) => {
						let index = src.indexOf("![[");
						
						// if (index === -1) {
						// 	const match = regexImage.exec(src);
						// 	if (match) {
						// 		console.log("start: match image", match);
						// 		return match.index;
						// 	}else{
						// 		console.log("start: no match embed or image:");
						// 	}
						// }else{
						// 	console.log("start: match embed", index);
						// }

						return index;
					},
					tokenizer: (src: string) => {
						const matches = src.match(EmbedRegex);
						if (matches == null) {
							// const match = regexImage.exec(src);
							// if (match) {
							// 	console.log("tokenizer: match image", match);
								
							// 	return {
							// 		type: "Embed",
							// 		raw: match[0],
							// 		text: match[1],
							// 		href: match[2],
							// 	};
							// }
							return;
						}
						const token: Token = {
							type: "Embed",
							raw: matches[0],
							href: matches[1],
							text: matches[1],
						};

						return token;
					},
					renderer: (token: Tokens.Generic) => {
						const embedType = getEmbedType(token.href);
						console.log("[WeWrite Embed] Rendering embed - type:", embedType, "href:", token.href);
						
						if (embedType == "image" || embedType == "webp") {
							// images
							let item = this.parseImageLink(token.href);
							if (item) {
								const src = this.getImagePath(item.path);

								const width = item.width
									? `width="${item.width}"`
									: "";
								const height = item.height
									? `height="${item.height}"`
									: "";
								return `<img src="${src}" alt="${token.text}" ${width} ${height} />`;
							}
						} else if (embedType == "svg") {
							const info = this.parseSVGLink(token.href);
							const id = this.generateId();
							let svg = $t("render.rendering");
							if (Embed.fileCache.has(info.filename)) {
								svg =
									Embed.fileCache.get(info.filename) ||
									$t("render.render-failed");
							} else {
								this.renderSVGFile(info.filename, id);
							}
							return `<span class="${info.classname}"><span class="note-embed-svg" id="${id}" ${info.style}>${svg}</span></span>`;
						} else if (embedType == "excalidraw") {
							return token.html;
						} else if (embedType == "pdf-crop") {
							return this.renderPdfCrop(token.href);
						} else if (embedType == "note") {
							return token.html;
						} else if (embedType == "video") {
							console.log("[WeWrite Embed] Rendering video");
							return this.renderVideo(token.href);
						} else if (embedType == "voice") {
							console.log("[WeWrite Embed] Rendering voice");
							return this.renderVoice(token.href);
						} else {
							console.log("[WeWrite Embed] Unknown type:", embedType);
							// return 'unknown type: '+token.href
						}
					},
				},
			],
			async: true,
			walkTokens: async (token: Tokens.Generic) => {
				if (token.type !== "Embed") return;
				const embedType = getEmbedType(token.href);
				if (embedType === "excalidraw") {
					await this.renderExcalidrawAsync(token);
				} else if (embedType === "note") {
					await this.renderMarkdownEmbedAsync(token);
				}
			},
		};
	}

	async renderExcalidrawAsync(token: Tokens.Generic) {
		if (!this.isPluginInstlled("obsidian-excalidraw-plugin")) {

			return false;
		}
		// define default failed
		token.html = $t("render.excalidraw-failed");

		const href = token.href;
		const index = this.excalidrawIndex;
		this.excalidrawIndex++;
		const renderer = ObsidianMarkdownRenderer.getInstance(this.plugin.app);
		const root = renderer.queryElement(index, "div.excalidraw-svg");
		if (!root) {
			console.error(`renderExcalidrawAsync error:`, "root is null");
			return;
		}
		root.removeAttribute("style");
		try {
			const image = root.querySelector("img");
			if (image) {
				image.setAttr("width", "100%");
				image.setAttr("height", "100%");
				image.setAttr("style", "width:100%;height:100%");
			}
			const dataUrl = await renderer.domToImage(root);

			token.html = `<section class="excalidraw" ><img src="${dataUrl}" class="exclaidraw-image" ></section>`;
		} catch (e) {
			console.error(`renderExcalidrawAsync error:`, e);
		}
	}
	async renderMarkdownEmbedAsync(token: Tokens.Generic) {
		const href = token.href;
		const content = await this.renderFile(href);
		token.html = `<div class="markdown-embed inline-embed is-loaded">${content}</div>`;
	}

	renderPdfCrop(href: string): string | false | undefined {
		if (!this.isPluginInstlled("pdf-plus")) {
			return false;
		}
		const root = ObsidianMarkdownRenderer.getInstance(
			this.plugin.app
		).queryElement(this.pdfCropIndex, ".pdf-cropped-embed");
		if (!root) {
			return $t("render.pdf-crop-failed");
		}
		this.pdfCropIndex++;
		return `<section class="pdf-crop">${root.outerHTML}</section>`;
	}
	renderVideo(href: string): string | false | undefined {
		// 先尝试从 Obsidian 渲染器获取
		const root = ObsidianMarkdownRenderer.getInstance(
			this.plugin.app
		).queryElement(this.videoIndex, "video");
		
		this.videoIndex++;
		
		if (root) {
			return `<section class="video">${root.outerHTML}</section>`;
		}
		
		// 如果获取失败，直接生成 video 标签
		const src = this.getImagePath(href);
		if (!src) {
			return "render video failed: file not found";
		}
		
		return `<section class="video"><video src="${src}" controls preload="metadata" style="width: 100%; max-width: 100%;"></video></section>`;
	}
	renderVoice(href: string): string | false | undefined {
		console.log('[WeWrite Audio] Rendering audio:', href);
		
		// 先尝试从 Obsidian 渲染器获取
		const root = ObsidianMarkdownRenderer.getInstance(
			this.plugin.app
		).queryElement(this.voiceIndex, "audio");
		
		this.voiceIndex++;
		
		if (root) {
			console.log('[WeWrite Audio] Got audio from Obsidian renderer');
			return `<section class="audio">${root.outerHTML}</section>`;
		}
		
		// 如果获取失败，直接生成 audio 标签
		console.log('[WeWrite Audio] Generating audio tag manually');
		const src = this.getImagePath(href);
		if (!src) {
			console.error('[WeWrite Audio] Failed to get file path for:', href);
			return "render voice failed: file not found";
		}
		
		console.log('[WeWrite Audio] Audio src:', src);
		return `<section class="audio"><audio src="${src}" controls preload="metadata" style="width: 100%; max-width: 500px;"></audio></section>`;
	}
}
