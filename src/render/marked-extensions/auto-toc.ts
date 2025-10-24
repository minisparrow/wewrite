/**
 * Auto TOC Extension
 * 自动在文章开头生成目录
 * Automatically generate table of contents at the beginning of the article
 */

import { Marked } from "marked";
import WeWritePlugin from "src/main";
import { PreviewRender, WeWriteMarkedExtension } from "./extension";

export class AutoTOC extends WeWriteMarkedExtension {
    constructor(plugin: WeWritePlugin, previewRender: PreviewRender, marked: Marked) {
        super(plugin, previewRender, marked);
    }

    markedExtension() {
        return {};
    }

    /**
     * 在 HTML 中自动插入目录
     * 目录会被插入到第一个 h1 或 h2 之前
     */
    async postprocess(html: string): Promise<string> {
        // 解析 HTML 获取所有标题
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 查找所有 h1 和 h2 标题
        const headings = doc.querySelectorAll('h1, h2');
        
        if (headings.length === 0) {
            // 没有标题，不生成目录
            return html;
        }

        // 构建目录 HTML
        let tocHtml = '<div class="wewrite-auto-toc">\n';
        tocHtml += '<h1 class="wewrite-toc-title">\n';
        tocHtml += '<span class="wewrite-heading-outbox">\n';
        tocHtml += '<span class="wewrite-heading-leaf">目录</span>\n';
        tocHtml += '</span>\n';
        tocHtml += '</h1>\n';
        tocHtml += '<ol class="wewrite-toc-list">\n';

        let currentH1Index = 0;
        let currentH2Index = 0;
        let inH1Section = false;

        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.substring(1)); // h1 -> 1, h2 -> 2
            const text = heading.textContent || '';
            
            // 为标题生成 ID（如果没有）
            let headingId = heading.getAttribute('id');
            if (!headingId) {
                headingId = `wewrite-heading-${index}`;
                heading.setAttribute('id', headingId);
            }

            if (level === 1) {
                // 如果前面有 h2，需要关闭 ol
                if (inH1Section) {
                    tocHtml += '</ol>\n</li>\n';
                }
                
                currentH1Index++;
                currentH2Index = 0;
                inH1Section = false;
                
                tocHtml += `<li class="wewrite-toc-item wewrite-toc-h1">\n`;
                tocHtml += `<a href="#${headingId}" class="wewrite-toc-link">\n`;
                tocHtml += `<span class="wewrite-toc-number">${currentH1Index}</span>\n`;
                tocHtml += `<span class="wewrite-toc-text">${text}</span>\n`;
                tocHtml += `</a>\n`;
                
            } else if (level === 2) {
                // 第一次遇到 h2，需要开启子列表
                if (!inH1Section) {
                    tocHtml += '<ol class="wewrite-toc-sublist">\n';
                    inH1Section = true;
                }
                
                currentH2Index++;
                
                tocHtml += `<li class="wewrite-toc-item wewrite-toc-h2">\n`;
                tocHtml += `<a href="#${headingId}" class="wewrite-toc-link">\n`;
                tocHtml += `<span class="wewrite-toc-number">${currentH1Index}.${currentH2Index}</span>\n`;
                tocHtml += `<span class="wewrite-toc-text">${text}</span>\n`;
                tocHtml += `</a>\n`;
                tocHtml += `</li>\n`;
            }
            
            // h1 在有下一个 h1 或结束时才关闭
            if (level === 1) {
                const nextHeading = headings[index + 1];
                if (!nextHeading || nextHeading.tagName === 'H1') {
                    tocHtml += `</li>\n`;
                }
            }
        });

        // 关闭最后的 h1 子列表（如果有）
        if (inH1Section) {
            tocHtml += '</ol>\n</li>\n';
        }

        tocHtml += '</ol>\n';
        tocHtml += '</div>\n';
        tocHtml += '<hr class="wewrite-toc-divider">\n';

        // 将目录插入到第一个标题之前
        const firstHeading = doc.querySelector('h1, h2');
        if (firstHeading && firstHeading.parentNode) {
            const tocElement = parser.parseFromString(tocHtml, 'text/html').body.firstChild;
            if (tocElement) {
                firstHeading.parentNode.insertBefore(tocElement, firstHeading);
            }
        }

        // 返回更新后的 HTML
        return doc.body.innerHTML;
    }
}
