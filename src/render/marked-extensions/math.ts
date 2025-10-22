/*
* marked extension for math:
 use mathjax to render math

  credits to Sun BooShi, author of note-to-mp plugin
  
 */

import { parseMath } from "../mathjax";
import { MarkedExtension, Token, Tokens } from "marked";
import { WeWriteMarkedExtension } from "./extension";

// 行内公式：$内容$ - 简化版本，只要求内容不为空且不包含换行
const inlineRule = /^(\$)(?!\$)([^\n$]+?)\1(?!\$)/;
// 块级公式：$$内容$$ - 使用非贪婪匹配找到最近的结束 $$
const blockRule = /^(\$\$)([\s\S]*?)\1(?=\s|$)/;

export class MathRenderer extends WeWriteMarkedExtension {
    
    renderer(token: Tokens.Generic, inline: boolean, type: string = '') {
        if (type === '') {
            type = 'InlineMath'
        }
        const svg = parseMath(token.text) 
        if (inline){
            return `<span  class="inline-math">${svg}</span>`;  
        }else{

            return `<section  class="block-math">${svg}</section>`;
        }
    }

    markedExtension(): MarkedExtension {
        return {
            extensions: [
                this.inlineMath(),
                this.blockMath()
            ]
        }
    }

    inlineMath() {
        return {
            name: 'InlineMath',
            level: 'inline',
            start(src: string) {

                // 
                let index;
                let indexSrc = src;

                while (indexSrc) {
                    index = indexSrc.indexOf('$');
                    if (index === -1) {
                        // no '$' in the string
                        return;
                    }

                    const possibleKatex = indexSrc.substring(index);

                    //from the index, check if match the inline rule
                    if (possibleKatex.match(inlineRule)) {
                        return index;
                    }

                    indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, '');
                }
            },
            tokenizer(src: string, tokens: Token[]) {
                const match = src.match(inlineRule);
                if (match) {
                    return {
                        type: 'InlineMath',
                        raw: match[0],
                        text: match[2].trim(),
                        displayMode: match[1].length === 2
                    };
                }
            },
            renderer: (token: Tokens.Generic) => {
               return this.renderer(token, true);
            }
        }
    }
    blockMath() {
        return {
            name: 'BlockMath',
            level: 'inline', // 改为 inline level，这样可以在行内任意位置匹配
            start(src: string) {
                const index = src.indexOf('$$');
                return index >= 0 ? index : undefined;
            },
            tokenizer(src: string) {
                const match = src.match(blockRule);
                if (match) {
                    const text = match[2].trim();
                    // 忽略空内容或只有空白的公式
                    if (!text || text.length === 0) {
                        return undefined;
                    }
                    
                    // 块级公式应该包含一定的复杂度
                    // 允许较短的公式，但要求包含数学符号
                    if (!text.includes('\n') && text.length < 2) {
                        return undefined;
                    }
                    
                    return {
                        type: 'BlockMath',
                        raw: match[0],
                        text: text,
                        displayMode: true
                    };
                }
            },
            renderer: (token: Tokens.Generic) => {
                return this.renderer(token, false);
            }
        };
    }
}
