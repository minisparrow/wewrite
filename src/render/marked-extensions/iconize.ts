/** 
 * marked extension for iconize 
 */
import { MarkedExtension, Tokens } from "marked";
import { Plugin, sanitizeHTMLToDom } from 'obsidian';
import { WeWriteMarkedExtension } from "./extension";

const iconsRegex = /:(.*?):/;
const iconsRegexTokenizer = /^:(.*?):/;
export class IconizeRender extends WeWriteMarkedExtension {
    iconizeIndex: number = 0;
    icon: any; // 使用 any 类型，因为这是第三方插件

    async prepare() {
        this.iconizeIndex = 0;
        this.icon = this.plugin.app.plugins.plugins["obsidian-icon-folder"]
    }

    getIconByname(iconName: string) {
        // 检查插件是否已安装和加载
        if (!this.icon || !this.icon.api) {
            return null;
        }
        //@ts-ignore
        return this.icon.api.getIconByName(iconName)
    }
    render(iconName: string) {
        // 如果插件未安装，直接返回原始文本
        if (!this.icon || !this.icon.api) {
            return `:${iconName}:`;
        }
        
        const iconObject = this.getIconByname(iconName)
        if (iconObject) {
            const rootSpan = createSpan({
                cls: 'cm-iconize-icon',
                attr: {
                    'aria-label': iconName,
                    'data-icon': iconName,
                    'aria-hidden': 'true',
                },
            });
            rootSpan.style.display = 'inline-flex';
            rootSpan.style.transform = 'translateY(13%)';
            // rootSpan.innerHTML = iconObject.svgElement; 

			rootSpan.appendChild(sanitizeHTMLToDom( iconObject.svgElement))
            return rootSpan.outerHTML;
        }
        // 图标未找到，返回原始文本
        return `:${iconName}:`;
    }

    markedExtension(): MarkedExtension {
        return {
            extensions: [{
                name: 'iconize',
                level: 'inline',
                start: (src: string) => {
                    const match = src.match(iconsRegex);
                    if (match) {
                        return match.index;
                    }
                },
                tokenizer: (src: string) => {
                    const match = src.match(iconsRegexTokenizer);
                    if (match) {
                        return {
                            type: 'iconize',
                            raw: match[0],
                            text: match[1],
                        };
                    }
                },
                renderer: (token: Tokens.Generic) => {
                    return this.render(token.text);
                }
            }]
        }
    }
}

