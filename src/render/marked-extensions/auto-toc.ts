/**
 * Auto TOC Extension
 * 自动在文章开头生成目录
 * Automatically generate table of contents at the beginning of the article
 */

import { Marked } from "marked";
import WeWritePlugin from "src/main";
import { PreviewRender, WeWriteMarkedExtension } from "./extension";

interface TocItem {
    level: number;
    text: string;
    id: string;
}

export class AutoTOC extends WeWriteMarkedExtension {
    constructor(plugin: WeWritePlugin, previewRender: PreviewRender, marked: Marked) {
        super(plugin, previewRender, marked);
    }

    markedExtension() {
        return {};
    }

    /**
     * 从 HTML 中提取标题信息
     * 支持 h1-h6 所有层级
     */
    private extractHeadings(html: string): TocItem[] {
        const headings: TocItem[] = [];
        
        // 匹配 h1-h6 标签，提取标题文本
        for (let level = 1; level <= 6; level++) {
            const regex = new RegExp(`<h${level}[^>]*?id="([^"]*)"[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi');
            let match;
            
            while ((match = regex.exec(html)) !== null) {
                const id = match[1];
                const content = match[2];
                // 去除 HTML 标签，只保留文本
                const text = content.replace(/<[^>]+>/g, '').trim();
                if (text) {
                    headings.push({ level, text, id });
                }
            }
        }
        
        // 按在 HTML 中的位置排序
        headings.sort((a, b) => {
            const aPos = html.indexOf(`id="${a.id}"`);
            const bPos = html.indexOf(`id="${b.id}"`);
            return aPos - bPos;
        });
        
        return headings;
    }

    /**
     * 生成目录 HTML
     * 不使用链接锚点，改用纯文本样式的目录
     * 微信公众号不支持 # 锚点链接
     */
    private generateTocHtml(headings: TocItem[]): string {
        if (headings.length === 0) {
            return '';
        }

        let tocHtml = '';
        
        // 目录标题 - 按钮居中显示，白色文字
        tocHtml += '<div style="text-align: center; margin: 1.5rem 0 1rem 0;">\n';
        tocHtml += '<span style="background: linear-gradient(135deg, #1e4d8b 0%, #15366b 100%); color: #ffffff; padding: 0.6rem 1.8rem; border-radius: 2rem; display: inline-block; box-shadow: 0 4px 12px rgba(37, 99, 168, 0.3); font-weight: bold; font-size: 1.1rem;">目录</span>\n';
        tocHtml += '</div>\n';
        
        // 用于跟踪各级标题的序号
        const counters = [0, 0, 0, 0, 0, 0]; // h1-h6 的计数器

        headings.forEach((heading) => {
            const level = heading.level;
            
            // 更新当前级别的计数器
            counters[level - 1]++;
            
            // 重置更深层级的计数器
            for (let i = level; i < 6; i++) {
                counters[i] = 0;
            }
            
            // 生成序号（如 1, 1.1, 1.1.1）
            let number = '';
            for (let i = 0; i < level; i++) {
                if (counters[i] > 0) {
                    number += (number ? '.' : '') + counters[i];
                }
            }
            
            // 计算缩进（每级缩进 1.5rem）
            const indent = (level - 1) * 1.5;
            
            // 根据层级调整样式
            const fontSize = Math.max(0.85, 1.05 - level * 0.05); // 字体逐级缩小
            const fontWeight = level <= 2 ? 500 : 'normal';
            const numberSize = Math.max(0.75, 0.9 - level * 0.05);
            
            // 序号样式
            let numberStyle = '';
            if (level === 1) {
                // H1: 圆形
                numberStyle = `display: inline-block; min-width: 1.8rem; height: 1.8rem; line-height: 1.8rem; text-align: center; margin-right: 0.5rem; border: 1.5px solid #2563a8; border-radius: 50%; font-size: ${numberSize}rem;`;
            } else {
                // H2-H6: 圆角矩形
                numberStyle = `display: inline-block; min-width: ${1.5 + level * 0.3}rem; height: 1.5rem; line-height: 1.5rem; text-align: center; margin-right: 0.5rem; border: 1.5px solid #2563a8; border-radius: 0.75rem; font-size: ${numberSize}rem; padding: 0 0.2rem;`;
            }
            
            // 生成目录项
            tocHtml += `<p style="margin: 0.6rem 0; line-height: 1.8; color: #2563a8; font-size: ${fontSize}rem; font-weight: ${fontWeight}; text-align: center; padding-left: ${indent}rem;">\n`;
            tocHtml += `<span style="${numberStyle}">${number}</span>\n`;
            tocHtml += `<span>${heading.text}</span>\n`;
            tocHtml += `</p>\n`;
        });

        // 分隔线
        tocHtml += '<hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #e5e5e5;"/>\n';

        return tocHtml;
    }

    /**
     * 在 HTML 中自动插入目录
     */
    async postprocess(html: string): Promise<string> {
        // 检查是否启用自动生成目录
        if (!this.plugin.settings.autoGenerateTOC) {
            return html;
        }
        
        // 提取所有标题
        const headings = this.extractHeadings(html);
        
        if (headings.length === 0) {
            return html;
        }

        // 生成目录 HTML
        const tocHtml = this.generateTocHtml(headings);
        
        // 将目录插入到第一个标题之前
        const firstH1Match = /<h1[^>]*>/i.exec(html);
        const firstH2Match = /<h2[^>]*>/i.exec(html);
        
        let insertPos = -1;
        if (firstH1Match && firstH2Match) {
            insertPos = Math.min(firstH1Match.index, firstH2Match.index);
        } else if (firstH1Match) {
            insertPos = firstH1Match.index;
        } else if (firstH2Match) {
            insertPos = firstH2Match.index;
        }
        
        if (insertPos >= 0) {
            return html.slice(0, insertPos) + tocHtml + html.slice(insertPos);
        }
        
        return html;
    }
}
