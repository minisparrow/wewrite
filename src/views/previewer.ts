/**
 * Define the right-side leaf of view as Previewer view
 */

import { EditorView } from "@codemirror/view";
import {
	Component,
	debounce,
	DropdownComponent,
	Editor,
	EventRef,
	ItemView,
	MarkdownView,
	Notice,
	sanitizeHTMLToDom,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import { PreviewRender } from "src/render/marked-extensions/extension";
import {
	uploadCanvas,
	uploadSVGs,
	uploadURLImage,
	uploadURLVideo,
	uploadURLAudio,
} from "src/render/post-render";
import { WechatRender } from "src/render/wechat-render";
import { ResourceManager } from "../assets/resource-manager";
import { WechatClient } from "../wechat-api/wechat-client";
import { MPArticleHeader } from "./mp-article-header";
import { ThemeManager } from "../theme/theme-manager";
import { ThemeSelector } from "../theme/theme-selector";
import { WebViewModal } from "./webview";
import { log } from "console";

export const VIEW_TYPE_WEWRITE_PREVIEW = "wewrite-article-preview";
export interface ElectronWindow extends Window {
	WEBVIEW_SERVER_URL: string;
}

/**
 * PreviewPanel is a view component that renders and previews markdown content with WeChat integration.
 * It provides real-time rendering, theme selection, and draft management capabilities for WeChat articles.
 * 
 * Features:
 * - Real-time markdown rendering with debounced updates
 * - Theme selection and application
 * - Draft management (send to WeChat draft box, copy to clipboard)
 * - Frontmatter property handling
 * - Shadow DOM rendering container
 * 
 * The panel integrates with WeChatClient for draft operations and maintains article properties in sync with markdown frontmatter.
 */
export class PreviewPanel extends ItemView implements PreviewRender {
	markdownView: MarkdownView | null = null;
	private articleDiv: HTMLDivElement;
	private listeners: EventRef[] = [];
	currentView: EditorView;
	observer: any;
	private wechatClient: WechatClient;
	private plugin: WeWritePlugin;
	private themeSelector: ThemeSelector;
	private debouncedRender = debounce(async () => {
		if (this.plugin.settings.realTimeRender) {
			await this.renderDraft();
		}
	}, 2000);
	private debouncedUpdate = debounce(async () => {
		if (this.plugin.settings.realTimeRender) {
			await this.renderDraft();
		}
	}, 1000);
	private debouncedCustomThemeChange = debounce(async (theme: string) => {
		this.getArticleProperties();
		this.articleProperties.set("custom_theme", theme);
		this.setArticleProperties();
		this.renderDraft();
	}, 2000);

	private draftHeader: MPArticleHeader;
	articleProperties: Map<string, string> = new Map();
	editorView: EditorView | null = null;
	lastLeaf: WorkspaceLeaf | undefined;
	renderDiv: any;
	elementMap: Map<string, Node | string>;
	articleTitle: Setting;
	containerDiv: HTMLElement;
	mpModal: WebViewModal;
	isActive: boolean = false;
	renderPreviewer: any;
	private scrollSyncEnabled: boolean = true;
	private isScrolling: boolean = false;
	private editorScrollListener: any = null;
	private previewScrollListener: any = null;
	private tocContainer: HTMLElement | null = null;
	private tocVisible: boolean = false;
	private contentWrapper: HTMLElement | null = null;
	getViewType(): string {
		return VIEW_TYPE_WEWRITE_PREVIEW;
	}
	getDisplayText(): string {
		return $t("views.previewer.wewrite-previewer");
	}
	getIcon() {
		return "pen-tool";
	}
	constructor(leaf: WorkspaceLeaf, plugin: WeWritePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.wechatClient = WechatClient.getInstance(this.plugin);
		this.themeSelector = new ThemeSelector(plugin);
	}

	async onOpen() {
		this.buildUI();
		this.startListen();

		this.plugin.messageService.registerListener(
			"draft-title-updated",
			(title: string) => {
				this.articleTitle.setName(title);
			}
		);
		this.themeSelector.startWatchThemes();
		this.plugin.messageService.registerListener(
			"custom-theme-changed",
			async (theme: string) => {
				this.debouncedCustomThemeChange(theme);
			}
		);
		this.plugin.messageService.sendMessage("active-file-changed", null);
		this.loadComponents();
		
		// 延迟启动滚动同步，给足够时间让视图完全加载
		setTimeout(() => {
			console.log('[WeWrite ScrollSync] Initial sync setup from onOpen');
			this.startScrollSync();
		}, 2000);
	}

	getArticleProperties() {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (
			activeFile?.extension === "md" ||
			activeFile?.extension === "markdown"
		) {
			const cache = this.app.metadataCache.getCache(activeFile.path);
			const frontmatter = cache?.frontmatter;
			this.articleProperties.clear();
			if (frontmatter !== undefined && frontmatter !== null) {
				Object.keys(frontmatter).forEach((key) => {
					this.articleProperties.set(key, frontmatter[key]);
				});
			}
		}
		return this.articleProperties;
	}
	async setArticleProperties() {
		const path = this.getCurrentMarkdownFile();

		if (path && this.articleProperties.size > 0) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				throw new Error(
					$t("views.previewer.file-not-found-path", [path])
				);
			}
			this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				this.articleProperties.forEach((value, key) => {
					frontmatter[key] = value;
				});
			});
		}

	}

	public getCurrentMarkdownFile() {
		const currentFile = this.plugin.app.workspace.getActiveFile();
		const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
		for (let leaf of leaves) {
			const markdownView = leaf.view as MarkdownView;
			if (markdownView.file?.path === currentFile?.path) {
				return markdownView.file?.path;
			}
		}
		return null;
	}
	async buildUI() {
		const container = this.containerEl.children[1];
		container.empty();

		const mainDiv = container.createDiv({
			cls: "wewrite-previewer-container",
		});
		this.articleTitle = new Setting(mainDiv)
			.setName($t("views.previewer.article-title"))
			.setHeading()
			.addDropdown((dropdown: DropdownComponent) => {
				this.themeSelector.dropdown(dropdown);
			})
			.addExtraButton((button) => {
				button
					.setIcon("list")
					.setTooltip($t("views.previewer.toggle-toc"))
					.onClick(() => {
						this.toggleTOC();
						button.setIcon(this.tocVisible ? "list-checks" : "list");
					});
			})
			.addExtraButton((button) => {
				// 设置初始状态
				button
					.setIcon(this.scrollSyncEnabled ? "link" : "unlink")
					.setTooltip(
						this.scrollSyncEnabled 
							? $t("views.previewer.scroll-sync-enabled")
							: $t("views.previewer.scroll-sync-disabled")
					)
					.onClick(() => {
						const enabled = this.toggleScrollSync();
						button.setIcon(enabled ? "link" : "unlink");
						button.setTooltip(
							enabled 
								? $t("views.previewer.scroll-sync-enabled")
								: $t("views.previewer.scroll-sync-disabled")
						);
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("refresh-cw")
					.setTooltip($t("views.previewer.render-article"))
					.onClick(async () => {
						this.renderDraft();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("send-horizontal")
					.setTooltip($t("views.previewer.send-article-to-draft-box"))
					.onClick(async () => {
						if (await this.checkCoverImage()) {
							this.sendArticleToDraftBox();
						} else {
							new Notice(
								$t("views.previewer.please-set-cover-image")
							);
						}
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("clipboard-copy")
					.setTooltip($t("views.previewer.copy-article-to-clipboard"))
					.onClick(async () => {
						const data = this.getArticleContent();
						await navigator.clipboard.write([
							new ClipboardItem({
								"text/html": new Blob([data], {
									type: "text/html",
								}),
							}),
						]);
						new Notice(
							$t("views.previewer.article-copied-to-clipboard")
						);
					});
			});

		this.draftHeader = new MPArticleHeader(this.plugin, mainDiv);

		this.renderDiv = mainDiv.createDiv({ cls: "render-container" });
		this.renderDiv.id = "render-div";
		this.renderDiv.style.height = "100%";
		this.renderDiv.style.overflow = "hidden"; // 禁止外层容器滚动
		
		this.renderPreviewer = mainDiv.createDiv({
			cls: ".wewrite-render-preview",
		})
		this.renderPreviewer.hide()
		let shadowDom = this.renderDiv.shawdowRoot;
		if (shadowDom === undefined || shadowDom === null) {
			shadowDom = this.renderDiv.attachShadow({ mode: 'open' });
			shadowDom.adoptedStyleSheets = [
				ThemeManager.getInstance(this.plugin).getShadowStleSheet()
			];
		}

		// 创建主容器（flexbox 布局）
		this.containerDiv = shadowDom.createDiv({ cls: "wewrite-article" });
		this.containerDiv.style.display = "flex";
		this.containerDiv.style.height = "100%";
		this.containerDiv.style.overflow = "hidden";
		
		// 创建 TOC 容器（左侧，默认隐藏）
		this.tocContainer = this.containerDiv.createDiv({ cls: "wewrite-toc-container" });
		this.tocContainer.style.display = "none"; // 初始隐藏，显示时会设置为 flex
		this.tocContainer.style.flexDirection = "column";
		this.tocContainer.style.width = "250px";
		this.tocContainer.style.minWidth = "150px";
		this.tocContainer.style.maxWidth = "500px";
		this.tocContainer.style.height = "100%";
		this.tocContainer.style.overflowY = "hidden"; // 容器本身不滚动
		this.tocContainer.style.overflowX = "hidden";
		this.tocContainer.style.backgroundColor = "var(--background-secondary)";
		this.tocContainer.style.padding = "10px";
		this.tocContainer.style.borderRight = "1px solid var(--background-modifier-border)";
		this.tocContainer.style.position = "relative";
		this.tocContainer.style.flexShrink = "0";
		
		// 创建可拖拽的分隔条
		const resizer = this.tocContainer.createDiv({ cls: "wewrite-toc-resizer" });
		resizer.style.position = "absolute";
		resizer.style.right = "0";
		resizer.style.top = "0";
		resizer.style.bottom = "0";
		resizer.style.width = "4px";
		resizer.style.cursor = "col-resize";
		resizer.style.backgroundColor = "transparent";
		resizer.style.zIndex = "10";
		
		// 添加拖拽功能
		let isResizing = false;
		let startX = 0;
		let startWidth = 0;
		
		resizer.addEventListener('mousedown', (e) => {
			isResizing = true;
			startX = e.clientX;
			startWidth = this.tocContainer!.offsetWidth;
			e.preventDefault();
		});
		
		document.addEventListener('mousemove', (e) => {
			if (!isResizing) return;
			const diff = e.clientX - startX;
			const newWidth = startWidth + diff;
			if (newWidth >= 150 && newWidth <= 500) {
				this.tocContainer!.style.width = `${newWidth}px`;
			}
		});
		
		document.addEventListener('mouseup', () => {
			isResizing = false;
		});
		
		// 悬停时高亮分隔条
		resizer.addEventListener('mouseenter', () => {
			resizer.style.backgroundColor = "var(--interactive-accent)";
		});
		resizer.addEventListener('mouseleave', () => {
			if (!isResizing) {
				resizer.style.backgroundColor = "transparent";
			}
		});
		
		// 创建内容容器（右侧）
		this.contentWrapper = this.containerDiv.createDiv({ cls: "wewrite-content-wrapper" });
		this.contentWrapper.style.flex = "1";
		this.contentWrapper.style.overflowY = "auto";
		this.contentWrapper.style.overflowX = "hidden";
		this.contentWrapper.style.height = "100%";
		
		this.articleDiv = this.contentWrapper.createDiv({ cls: "article-div" });
	}
	async checkCoverImage() {
		return this.draftHeader.checkCoverImage();
	}
	async sendArticleToDraftBox() {
		await uploadSVGs(this.articleDiv, this.plugin.wechatClient);
		await uploadCanvas(this.articleDiv, this.plugin.wechatClient);
		await uploadURLImage(this.articleDiv, this.plugin.wechatClient);
		await uploadURLVideo(this.articleDiv, this.plugin.wechatClient);
		await uploadURLAudio(this.articleDiv, this.plugin.wechatClient);

		const media_id = await this.wechatClient.sendArticleToDraftBox(
			this.draftHeader.getActiveLocalDraft()!,
			this.getArticleContent()
		);

		if (media_id) {
			this.draftHeader.updateDraftDraftId(media_id);
			const news_item = await this.wechatClient.getDraftById(
				this.plugin.settings.selectedMPAccount!,
				media_id
			);
			if (news_item) {
				open(news_item[0].url);
				const item = {
					media_id: media_id,
					content: {
						news_item: news_item,
					},
					update_time: Date.now(),
				};
				this.plugin.messageService.sendMessage(
					"draft-item-updated",
					item
				);
			}
		}
	}
	public getArticleContent() {
		return this.articleDiv.innerHTML;
	}
	// async getCSS() {
	// 	return await ThemeManager.getInstance(this.plugin).getCSS();
	// }

	async onClose() {
		// Clean up our view
		this.stopListen();
	}

	async parseActiveMarkdown() {
		// get properties
		const prop = this.getArticleProperties();
		const mview = ResourceManager.getInstance(
			this.plugin
		).getCurrentMarkdownView();
		if (!mview) {
			return $t("views.previewer.not-a-markdown-view");
		}
		this.articleDiv.empty();
		this.elementMap = new Map<string, HTMLElement | string>();
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			return `<h1>No active file</h1>`;
		}
		if (activeFile.extension !== "md") {
			return `<h1>Not a markdown file</h1>`;
		}
		let html = await WechatRender.getInstance(this.plugin, this).parseNote(
			activeFile.path,
			this.renderPreviewer,
			this
		);

		// return; //to see the render tree.
		const articleSection = createEl("section", {
			cls: "wewrite-article-content wewrite",
		});
		const dom = sanitizeHTMLToDom(html);
		articleSection.appendChild(dom);

		this.articleDiv.empty();
		this.articleDiv.appendChild(articleSection);

		this.elementMap.forEach(
			async (node: HTMLElement | string, id: string) => {
				const item = this.articleDiv.querySelector(
					"#" + id
				) as HTMLElement;

				if (!item) return;
				if (typeof node === "string") {
					const tf = ResourceManager.getInstance(
						this.plugin
					).getFileOfLink(node);
					if (tf) {
						const file = this.plugin.app.vault.getFileByPath(
							tf.path
						);
						if (file) {
							const body = await WechatRender.getInstance(
								this.plugin,
								this
							).parseNote(file.path, this.articleDiv, this);
							item.empty();
							item.appendChild(sanitizeHTMLToDom(body));
						}
					}
				} else {
					item.appendChild(node);
				}
			}
		);
		// return this.articleDiv.innerHTML;
	}
	async renderDraft() {
		if (!this.isViewActive()) {
			return;
		}

		await this.parseActiveMarkdown();
		if (this.articleDiv === null || this.articleDiv.firstChild === null) {
			return;
		}
		await ThemeManager.getInstance(this.plugin).applyTheme(
			this.articleDiv.firstChild as HTMLElement
		);
		
		// 如果目录可见，重新生成目录
		if (this.tocVisible) {
			this.generateTOC();
		}
		
		// 渲染完成后重新启动滚动同步
		setTimeout(() => {
			console.log('[WeWrite ScrollSync] Re-sync after render');
			this.startScrollSync();
		}, 300);
	}
	isViewActive(): boolean {
		return this.isActive && !this.app.workspace.rightSplit.collapsed
	}

	startListen() {
		this.registerEvent(
			this.plugin.app.vault.on("rename", (file: TFile) => {
				this.draftHeader.onNoteRename(file);
			})
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				const isOpen = this.app.workspace.getLeavesOfType(VIEW_TYPE_WEWRITE_PREVIEW).length > 0;
				this.isActive = isOpen;
			})
		);

		const ec = this.app.workspace.on(
			"editor-change",
			(editor: Editor, info: MarkdownView) => {
				this.onEditorChange(editor, info);
			}
		);
		this.listeners.push(ec);

		const el = this.app.workspace.on("active-leaf-change", async (leaf) => {
			if (leaf){
				if(leaf.view.getViewType() === "markdown") {
					console.log('[WeWrite ScrollSync] Active leaf changed to markdown');
					this.plugin.messageService.sendMessage(
						"active-file-changed",
						null
					);
					this.debouncedUpdate();
					// 切换到 Markdown 视图时，尝试启动滚动同步
					setTimeout(() => {
						console.log('[WeWrite ScrollSync] Re-sync after leaf change');
						this.startScrollSync();
					}, 800);
				}else {
					this.isActive = (leaf.view === this);
					// 如果切换到预览面板，也尝试启动同步
					if (this.isActive && leaf.view === this) {
						setTimeout(() => {
							console.log('[WeWrite ScrollSync] Preview became active, trying sync');
							this.startScrollSync();
						}, 500);
					}
				}
			}
		});
		this.listeners.push(el);
	}
	stopListen() {
		this.listeners.forEach((e) => this.app.workspace.offref(e));
		this.stopScrollSync();
	}

	/**
	 * 获取编辑器滚动容器
	 */
	getEditorScrollContainer(): HTMLElement | null {
		// 方法1: 尝试获取活动的 Markdown 视图
		let markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		
		// 方法2: 如果活动视图不是 Markdown，查找所有 Markdown 视图
		if (!markdownView) {
			const leaves = this.app.workspace.getLeavesOfType("markdown");
			if (leaves.length > 0) {
				markdownView = leaves[0].view as MarkdownView;
				console.log('[WeWrite ScrollSync] Using first markdown view (not active)');
			}
		}
		
		if (!markdownView) {
			console.log('[WeWrite ScrollSync] No markdown view found');
			return null;
		}
		
		// 方法A: 尝试从 CodeMirror 6 API 获取
		try {
			//@ts-ignore
			const cm6ScrollDOM = markdownView.editor?.cm?.scrollDOM;
			if (cm6ScrollDOM) {
				console.log('[WeWrite ScrollSync] Found CM6 scroll container from API');
				return cm6ScrollDOM;
			}
		} catch (e) {
			console.log('[WeWrite ScrollSync] CM6 API not available');
		}
		
		// 方法B: 从 DOM 查找
		const leaf = markdownView.leaf;
		const contentEl = (leaf as any).containerEl || leaf.view.containerEl;
		
		if (!contentEl) {
			console.log('[WeWrite ScrollSync] No container element');
			return null;
		}
		
		// 尝试多种选择器
		const selectors = [
			'.cm-scroller',
			'.markdown-source-view .cm-scroller',
			'.cm-editor .cm-scroller',
			'.markdown-source-view.mod-cm6 .cm-scroller'
		];
		
		for (const selector of selectors) {
			const scroller = contentEl.querySelector(selector);
			if (scroller) {
				console.log(`[WeWrite ScrollSync] Found scroller with: ${selector}`);
				return scroller as HTMLElement;
			}
		}
		
		console.log('[WeWrite ScrollSync] No scroll container found in DOM');
		return null;
	}

	/**
	 * 启动滚动同步
	 */
	startScrollSync() {
		if (!this.scrollSyncEnabled) {
			console.log('[WeWrite ScrollSync] Sync disabled by user');
			return;
		}
		
		if (!this.containerDiv) {
			console.log('[WeWrite ScrollSync] Preview container not ready');
			return;
		}
		
		// 移除旧的监听器
		this.stopScrollSync();
		
		const editorScrollContainer = this.getEditorScrollContainer();
		if (!editorScrollContainer) {
			console.log('[WeWrite ScrollSync] Cannot find editor scroll container, will retry...');
			return;
		}
		
		console.log('[WeWrite ScrollSync] Starting scroll sync...');
		console.log('[WeWrite ScrollSync] Editor container:', editorScrollContainer);
		console.log('[WeWrite ScrollSync] Preview container:', this.containerDiv);
		
		// 编辑器滚动 -> 预览滚动
		this.editorScrollListener = () => {
			if (this.isScrolling) return;
			this.isScrolling = true;
			
			const maxScroll = editorScrollContainer.scrollHeight - editorScrollContainer.clientHeight;
			if (maxScroll <= 0) {
				this.isScrolling = false;
				return;
			}
			
			const scrollPercentage = editorScrollContainer.scrollTop / maxScroll;
			const previewMaxScroll = this.containerDiv.scrollHeight - this.containerDiv.clientHeight;
			const previewScrollTop = scrollPercentage * previewMaxScroll;
			
			this.containerDiv.scrollTop = previewScrollTop;
			
			setTimeout(() => {
				this.isScrolling = false;
			}, 50);
		};
		
		// 预览滚动 -> 编辑器滚动
		this.previewScrollListener = () => {
			if (this.isScrolling) return;
			this.isScrolling = true;
			
			const maxScroll = this.containerDiv.scrollHeight - this.containerDiv.clientHeight;
			if (maxScroll <= 0) {
				this.isScrolling = false;
				return;
			}
			
			const scrollPercentage = this.containerDiv.scrollTop / maxScroll;
			const editorMaxScroll = editorScrollContainer.scrollHeight - editorScrollContainer.clientHeight;
			const editorScrollTop = scrollPercentage * editorMaxScroll;
			
			editorScrollContainer.scrollTop = editorScrollTop;
			
			setTimeout(() => {
				this.isScrolling = false;
			}, 50);
		};
		
		editorScrollContainer.addEventListener('scroll', this.editorScrollListener, { passive: true });
		this.containerDiv.addEventListener('scroll', this.previewScrollListener, { passive: true });
		
		console.log('[WeWrite ScrollSync] Scroll sync started successfully');
	}

	/**
	 * 停止滚动同步
	 */
	stopScrollSync() {
		const editorScrollContainer = this.getEditorScrollContainer();
		
		if (editorScrollContainer && this.editorScrollListener) {
			editorScrollContainer.removeEventListener('scroll', this.editorScrollListener);
			this.editorScrollListener = null;
			console.log('[WeWrite ScrollSync] Removed editor listener');
		}
		
		if (this.containerDiv && this.previewScrollListener) {
			this.containerDiv.removeEventListener('scroll', this.previewScrollListener);
			this.previewScrollListener = null;
			console.log('[WeWrite ScrollSync] Removed preview listener');
		}
	}

	/**
	 * 滚动编辑器到指定标题
	 */
	async scrollEditorToHeading(headingText: string, headingLevel: number) {
		console.log('[WeWrite TOC] scrollEditorToHeading called with:', { headingText, headingLevel });
		try {
			// 去掉标题文本的前导和尾随空格
			headingText = headingText.trim();
			console.log('[WeWrite TOC] Trimmed heading text:', headingText);
			
			// 获取当前预览的文件
			const activeFile = this.app.workspace.getActiveFile();
			console.log('[WeWrite TOC] Current active file:', activeFile?.path);
			
			// 获取 MarkdownView，优先使用激活的视图，否则查找匹配当前文件的视图
			let markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
			
			if (!markdownView && activeFile) {
				console.log('[WeWrite TOC] No active markdown view, searching for view matching:', activeFile.path);
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				for (const leaf of leaves) {
					const view = leaf.view as MarkdownView;
					if (view.file?.path === activeFile.path) {
						markdownView = view;
						console.log('[WeWrite TOC] Found matching markdown view for file');
						break;
					}
				}
			}
			
			if (!markdownView) {
				console.log('[WeWrite TOC] Still no markdown view, using first available');
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				if (leaves.length > 0) {
					markdownView = leaves[0].view as MarkdownView;
				}
			}
			
			if (!markdownView) {
				console.log('[WeWrite TOC] No markdown view found at all');
				return;
			}

			console.log('[WeWrite TOC] Using markdown view for file:', markdownView.file?.path);

			// 获取编辑器内容
			const editor = markdownView.editor;
			const content = editor.getValue();
			const lines = content.split('\n');
			console.log('[WeWrite TOC] Total lines in editor:', lines.length);

			// 构建标题的正则表达式（例如：# Heading, ## Heading, ### Heading）
			const headingPrefix = '#'.repeat(headingLevel);
			const escapedText = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const headingPattern = new RegExp(`^${headingPrefix}\\s+${escapedText}\\s*$`);
			console.log('[WeWrite TOC] Looking for pattern:', headingPattern.toString());

			// 查找标题所在的行号
			let targetLine = -1;
			const candidateLines: string[] = [];
			
			for (let i = 0; i < lines.length; i++) {
				const trimmedLine = lines[i].trim();
				// 收集所有匹配级别的标题，用于调试
				if (trimmedLine.startsWith(headingPrefix + ' ')) {
					candidateLines.push(`Line ${i}: ${trimmedLine}`);
				}
				
				if (headingPattern.test(trimmedLine)) {
					console.log('[WeWrite TOC] Pattern matched at line', i, ':', trimmedLine);
					targetLine = i;
					break;
				}
			}
			
			// 如果精确匹配失败，尝试模糊匹配（只检查标题文本，忽略空格和 Markdown 格式）
			if (targetLine === -1) {
				console.log('[WeWrite TOC] Exact match failed. All h' + headingLevel + ' headings in file:');
				candidateLines.forEach(line => console.log('  ' + line));
				console.log('[WeWrite TOC] Looking for:', headingText);
				
				// 标准化函数：去除空格、Markdown 格式标记（**、*、__、_、~~等）
				const normalize = (text: string) => {
					return text.toLowerCase()
						.replace(/\*\*/g, '')  // 去除粗体 **
						.replace(/\*/g, '')    // 去除斜体 *
						.replace(/__/g, '')    // 去除粗体 __
						.replace(/_/g, '')     // 去除斜体 _
						.replace(/~~/g, '')    // 去除删除线 ~~
						.replace(/`/g, '')     // 去除代码标记 `
						.replace(/\s+/g, '')   // 去除所有空格
						.trim();
				};
				
				const normalizedText = normalize(headingText);
				console.log('[WeWrite TOC] Normalized search text:', normalizedText);
				
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i].trim();
					if (line.startsWith(headingPrefix + ' ')) {
						const lineText = line.substring(headingPrefix.length).trim();
						const normalizedLineText = normalize(lineText);
						
						if (i < 10 || Math.abs(i - targetLine) < 5) {
							console.log('[WeWrite TOC] Comparing with line', i, ':', lineText, '-> normalized:', normalizedLineText);
						}
						
						if (normalizedLineText === normalizedText) {
							console.log('[WeWrite TOC] ✅ Fuzzy matched at line', i, ':', lines[i]);
							targetLine = i;
							break;
						}
					}
				}
			}

			if (targetLine === -1) {
				console.log('[WeWrite TOC] Heading not found in editor:', headingText);
				return;
			}

			console.log('[WeWrite TOC] Found heading at line:', targetLine);

			// 滚动到目标行
			// 暂时禁用滚动同步，避免循环滚动
			const wasScrollSyncEnabled = this.scrollSyncEnabled;
			if (wasScrollSyncEnabled) {
				this.isScrolling = true;
			}

			// 设置光标位置
			editor.setCursor({ line: targetLine, ch: 0 });
			
			// 滚动编辑器，让目标行显示在窗口顶部
			// 使用 CodeMirror 6 的 scrollDOM 直接滚动
			const editorView = (markdownView.editor as any).cm as EditorView;
			if (editorView && editorView.scrollDOM) {
				// 获取目标行的位置信息
				const lineBlock = editorView.lineBlockAt(editorView.state.doc.line(targetLine + 1).from);
				console.log('[WeWrite TOC] Target line block top:', lineBlock.top);
				
				// 滚动到目标行的顶部位置
				editorView.scrollDOM.scrollTo({
					top: lineBlock.top,
					behavior: 'smooth'
				});
			} else {
				// 降级方案：使用 scrollIntoView，但不居中
				editor.scrollIntoView({ from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } }, false);
			}

			console.log('[WeWrite TOC] Scrolled editor to line:', targetLine);

			// 恢复滚动同步
			if (wasScrollSyncEnabled) {
				setTimeout(() => {
					this.isScrolling = false;
				}, 100);
			}
		} catch (error) {
			console.error('[WeWrite TOC] Error scrolling editor:', error);
		}
	}

	/**
	 * 切换滚动同步功能
	 */
	toggleScrollSync() {
		this.scrollSyncEnabled = !this.scrollSyncEnabled;
		if (this.scrollSyncEnabled) {
			this.startScrollSync();
		} else {
			this.stopScrollSync();
		}
		return this.scrollSyncEnabled;
	}

	/**
	 * 生成目录（TOC）
	 */
	generateTOC() {
		if (!this.tocContainer || !this.articleDiv) return;
		
		// 清空目录，但保留 resizer
		const resizer = this.tocContainer.querySelector('.wewrite-toc-resizer');
		this.tocContainer.empty();
		if (resizer) {
			this.tocContainer.appendChild(resizer);
		}
		
		// 查找所有标题
		const headings = this.articleDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
		
		if (headings.length === 0) {
			const emptyDiv = this.tocContainer.createEl('div', {
				text: $t("views.previewer.no-headings-found"),
				cls: 'wewrite-toc-empty'
			});
			emptyDiv.style.padding = "20px";
			emptyDiv.style.color = "var(--text-muted)";
			emptyDiv.style.textAlign = "center";
			return;
		}
		
		// 创建标题（固定）
		const titleEl = this.tocContainer.createEl('h4', {
			text: $t("views.previewer.table-of-contents"),
			cls: 'wewrite-toc-title'
		});
		titleEl.style.margin = "0 0 10px 0";
		titleEl.style.padding = "0";
		titleEl.style.fontSize = "14px";
		titleEl.style.fontWeight = "bold";
		titleEl.style.color = "var(--text-normal)";
		titleEl.style.borderBottom = "1px solid var(--background-modifier-border)";
		titleEl.style.paddingBottom = "8px";
		titleEl.style.flexShrink = "0";
		
		// 创建可滚动的列表容器
		const tocListWrapper = this.tocContainer.createEl('div', { cls: 'wewrite-toc-list-wrapper' });
		tocListWrapper.style.overflowY = "auto";
		tocListWrapper.style.overflowX = "hidden";
		tocListWrapper.style.flex = "1";
		tocListWrapper.style.marginTop = "5px";
		
		// 创建列表
		const tocList = tocListWrapper.createEl('div', { cls: 'wewrite-toc-list' });
		
		headings.forEach((heading, index) => {
			const level = parseInt(heading.tagName.substring(1)); // h1 -> 1, h2 -> 2, etc.
			const text = heading.textContent || '';
			const headingId = heading.getAttribute('id') || `wewrite-anchor-${index}`;
			
			// 确保标题有 id
			if (!heading.getAttribute('id')) {
				heading.setAttribute('id', headingId);
			}
			
			const tocItem = tocList.createEl('div', {
				cls: 'wewrite-toc-item',
			});
			
			// 根据标题级别添加缩进
			const indent = (level - 1) * 12;
			tocItem.style.paddingLeft = `${indent}px`;
			tocItem.style.cursor = 'pointer';
			tocItem.style.padding = `4px 8px 4px ${8 + indent}px`;
			tocItem.style.marginBottom = '1px';
			tocItem.style.borderRadius = '3px';
			tocItem.style.transition = 'background-color 0.1s';
			
			// 悬停效果
			tocItem.addEventListener('mouseenter', () => {
				tocItem.style.backgroundColor = 'var(--background-modifier-hover)';
			});
			tocItem.addEventListener('mouseleave', () => {
				tocItem.style.backgroundColor = 'transparent';
			});
			
			const link = tocItem.createEl('a', {
				text: text,
				cls: `wewrite-toc-link wewrite-toc-h${level}`
			});
			
			link.style.textDecoration = 'none';
			link.style.color = 'var(--text-normal)';
			link.style.fontSize = `${Math.max(11, 14 - (level - 1))}px`;
			link.style.display = 'block';
			link.style.whiteSpace = 'nowrap';
			link.style.overflow = 'hidden';
			link.style.textOverflow = 'ellipsis';
			link.title = text; // 悬停显示完整文本
			
			// 点击跳转到对应标题
			tocItem.addEventListener('click', async (e) => {
				e.preventDefault();
				console.log('[WeWrite TOC] Clicking on:', text, 'id:', headingId);
				
				// 查找目标标题
				const targetHeading = this.articleDiv.querySelector(`#${headingId}`) as HTMLElement;
				if (!targetHeading) {
					console.log('[WeWrite TOC] Target heading not found');
					return;
				}
				
				// 暂时禁用滚动同步，避免循环滚动
				const wasScrollSyncEnabled = this.scrollSyncEnabled;
				if (wasScrollSyncEnabled) {
					this.isScrolling = true;
				}
				
				// 在预览中滚动到目标标题
				if (this.contentWrapper) {
					// 使用 getBoundingClientRect 获取精确位置
					const wrapperRect = this.contentWrapper.getBoundingClientRect();
					const headingRect = targetHeading.getBoundingClientRect();
					
					console.log('[WeWrite TOC] Wrapper top:', wrapperRect.top);
					console.log('[WeWrite TOC] Heading top:', headingRect.top);
					console.log('[WeWrite TOC] Current scrollTop:', this.contentWrapper.scrollTop);
					
					// 计算标题相对于 contentWrapper 内容的位置
					// 公式：标题在文档中的位置 = 当前滚动位置 + (标题在视口中的位置 - 容器在视口中的位置)
					const targetScrollTop = this.contentWrapper.scrollTop + (headingRect.top - wrapperRect.top);
					
					console.log('[WeWrite TOC] Target scrollTop:', targetScrollTop);
					
					// 平滑滚动到目标位置，标题显示在窗口第一行
					this.contentWrapper.scrollTo({
						top: targetScrollTop,
						behavior: 'smooth'
					});
					
					// 验证滚动后的位置
					setTimeout(() => {
						console.log('[WeWrite TOC] After scroll, scrollTop:', this.contentWrapper?.scrollTop);
						const newHeadingRect = targetHeading.getBoundingClientRect();
						const newWrapperRect = this.contentWrapper!.getBoundingClientRect();
						console.log('[WeWrite TOC] After scroll - heading relative to wrapper:', newHeadingRect.top - newWrapperRect.top);
					}, 600);
				}
				
				// 同时在编辑器中滚动到对应位置
				console.log('[WeWrite TOC] About to call scrollEditorToHeading with:', { text, level });
				try {
					await this.scrollEditorToHeading(text, level);
					console.log('[WeWrite TOC] scrollEditorToHeading completed');
				} catch (error) {
					console.error('[WeWrite TOC] Error in scrollEditorToHeading:', error);
				}
				
				// 恢复滚动同步
				if (wasScrollSyncEnabled) {
					setTimeout(() => {
						this.isScrolling = false;
					}, 500); // 增加延迟，等待滚动动画完成
				}
				
				// 额外日志：检查滚动容器
				if (this.contentWrapper) {
					setTimeout(() => {
						console.log('[WeWrite TOC] After scroll - contentWrapper.scrollTop:', this.contentWrapper?.scrollTop);
						console.log('[WeWrite TOC] contentWrapper scrollHeight:', this.contentWrapper?.scrollHeight);
						console.log('[WeWrite TOC] contentWrapper clientHeight:', this.contentWrapper?.clientHeight);
					}, 100);
				}
			});
		});
	}

	/**
	 * 切换目录显示/隐藏
	 */
	toggleTOC() {
		if (!this.tocContainer) return;
		
		this.tocVisible = !this.tocVisible;
		
		if (this.tocVisible) {
			this.generateTOC();
			this.tocContainer.style.display = 'flex'; // 使用 flex 布局
		} else {
			this.tocContainer.style.display = 'none';
		}
	}

	onEditorChange(editor: Editor, info: MarkdownView) {
		this.debouncedRender();
	}
	updateElementByID(id: string, html: string): void {
		const item = this.articleDiv.querySelector("#" + id) as HTMLElement;
		if (!item) return;
		const doc = sanitizeHTMLToDom(html);

		item.empty();
		item.appendChild(doc);
		// if (doc.childElementCount > 0) {
		// 	for (const child of doc.children) {
		// 		item.appendChild(child.cloneNode(true));
		// 	}
		// } else {
		// 	item.innerText = $t("views.previewer.article-render-failed");
		// }
	}
	addElementByID(id: string, node: HTMLElement | string): void {
		if (typeof node === "string") {
			this.elementMap.set(id, node);
		} else {
			this.elementMap.set(id, node.cloneNode(true));
		}
	}
	private async loadComponents() {
			const view = this;
			type InternalComponent = Component & {
				_children: Component[];
				onload: () => void | Promise<void>;
			}
	
			const internalView = view as unknown as InternalComponent;
	
			// recursively call onload() on all children, depth-first
			const loadChildren = async (
				component: Component,
				visited: Set<Component> = new Set()
			): Promise<void> => {
				if (visited.has(component)) {
					return;  // Skip if already visited
				}
	
				visited.add(component);
	
				const internalComponent = component as InternalComponent;
	
				if (internalComponent._children?.length) {
					for (const child of internalComponent._children) {
						await loadChildren(child, visited);
					}
				}
				try {
					// relies on the Sheet plugin (advanced-table-xt) not to be minified
					if (component?.constructor?.name === 'SheetElement') {
						await component.onload();
					}
				} catch (error) {
					console.error(`Error calling onload()`, error);
				}
			};
			await loadChildren(internalView);
		}
}
