/**
 * marked extension for footnote
 * 
 * 
 * 
 */

import { MarkedExtension, Tokens } from "marked";
import { WeWriteMarkedExtension } from "./extension";

export class Links extends WeWriteMarkedExtension {

    allLinks: string[] = [];
    async prepare() {
        this.allLinks = [];
    }

    async postprocess(html: string) {
        if (!this.allLinks.length) {
            return html;
        }
        // 去重但保持顺序
        const uniqueLinks = [...new Set(this.allLinks)];
        const links = uniqueLinks.map((href, i) => {
            return `<li>${href}&nbsp;↩</li>`;
        });
        return `${html}<section class="foot-links"><hr class="foot-links-separator"><ol>${links.join('')}</ol></section>`;
    }

    markedExtension(): MarkedExtension {
        return {
            extensions: [{
                name: 'link',
                level: 'inline',
                renderer: (token: Tokens.Link) => {
                    if (token.href.startsWith('http')) {
                        this.allLinks.push(token.href);
                        return `<a href="${token.href}">${token.text}<sup>[${this.allLinks.length}]</sup></a>`;
                    } else {
                        // 非http外链直接返回，不添加到foot-links中
                        return `<a href="${token.href}">${token.text}</a>`;
                    }
                    // else {
                    //     return `<a>${token.text}[${token.href}]</a>`;
                    // }
                }
            }]
        }
    }
}
