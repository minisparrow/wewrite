/**
 * marked extension for handling images
 * 
 * Handles both:
 * 1. Standard Markdown images: ![alt](path)
 * 2. Post-processing: Add captions to all images
 * 
 */

import { MarkedExtension, Tokens } from "marked";
import { normalizePath, sanitizeHTMLToDom, TFile } from "obsidian";
import { WeWriteMarkedExtension } from "./extension";


export class Image extends WeWriteMarkedExtension {
	
	/**
	 * Get the absolute path for an image
	 * Handles relative paths from current note's directory
	 */
	getImagePath(imagePath: string): string {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!activeFile) {
			console.warn("[WeWrite Image] No active file, returning original path:", imagePath);
			return imagePath;
		}

		// If already absolute URL (http/https/data/app), return as-is
		if (imagePath.startsWith('http://') || 
		    imagePath.startsWith('https://') || 
		    imagePath.startsWith('data:') ||
		    imagePath.startsWith('app://')) {
			return imagePath;
		}

		console.log("[WeWrite Image] Looking for image:", imagePath);

		// Strategy 1: Try relative path from current note's directory
		const activeDir = activeFile.parent?.path || '';
		const fullPath = normalizePath(activeDir ? `${activeDir}/${imagePath}` : imagePath);
		
		console.log("[WeWrite Image] Trying relative path:", {
			imagePath,
			activeDir,
			fullPath
		});

		let file = this.plugin.app.vault.getAbstractFileByPath(fullPath);
		if (file instanceof TFile) {
			const resourcePath = this.plugin.app.vault.getResourcePath(file);
			console.log("[WeWrite Image] ✓ Found via relative path:", resourcePath);
			return resourcePath;
		}

		// Strategy 2: Try as absolute path from vault root
		const rootPath = normalizePath(imagePath);
		file = this.plugin.app.vault.getAbstractFileByPath(rootPath);
		if (file instanceof TFile) {
			const resourcePath = this.plugin.app.vault.getResourcePath(file);
			console.log("[WeWrite Image] ✓ Found via root path:", resourcePath);
			return resourcePath;
		}

		// Strategy 3: Search by filename in entire vault
		const fileName = imagePath.split('/').pop() || imagePath;
		console.log("[WeWrite Image] Searching vault for filename:", fileName);
		
		const allFiles = this.plugin.app.vault.getFiles();
		const matchingFile = allFiles.find(f => f.name === fileName);
		
		if (matchingFile) {
			const resourcePath = this.plugin.app.vault.getResourcePath(matchingFile);
			console.log("[WeWrite Image] ✓ Found via vault search:", matchingFile.path, "->", resourcePath);
			return resourcePath;
		}

		console.warn("[WeWrite Image] ✗ File not found anywhere in vault:", imagePath);
		return imagePath;
	}

	processImage(dom: HTMLDivElement) {

		const imgEls = dom.querySelectorAll('img')
		
		for (let i = 0; i < imgEls.length; i++) {
			const currentImg = imgEls[i]
			
			const classNames = currentImg.getAttribute('class')?.split(' ')
			
			
			if (classNames?.includes('wewrite-avatar-image')) {
				continue
			}else{
			}

			const title = currentImg.getAttribute('title')
			const alt = currentImg.getAttribute('alt-text')
			const caption = title || alt || ''
			const figureEl = createEl('figure',{cls:'image-with-caption'})
			currentImg.parentNode?.insertBefore(figureEl, currentImg)
			figureEl.appendChild(currentImg)
			if (caption){
				const captionRow = figureEl.createEl('div', { cls:'image-caption-row'})
				captionRow.createEl('div', { cls:'triangle'})
				captionRow.createEl('figcaption', { cls:'image-caption', text: caption })
			}
		}
		return dom
	}
	async postprocess(html: string) {

		const dom = sanitizeHTMLToDom(html)
		const tempDiv = createEl('div');
		tempDiv.appendChild(dom);
		this.processImage(tempDiv)
		return tempDiv.innerHTML;
	}

	markedExtension(): MarkedExtension {
		return {
			extensions: [],
			renderer: {
				// Override default image renderer to handle relative paths
				image: (token: Tokens.Image): string => {
					const href = token.href;
					const title = token.title;
					const text = token.text;
					
					console.log("[WeWrite Image] Rendering image:", { href, title, text });
					
					// Convert relative paths to absolute vault paths
					const src = this.getImagePath(href);
					
					const titleAttr = title ? `title="${title}"` : '';
					const altAttr = text ? `alt="${text}"` : '';
					
					return `<img src="${src}" ${altAttr} ${titleAttr} />`;
				}
			}
		}
	}
}
