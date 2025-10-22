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
// 块级公式：$$内容$$ - 必须在同一段落内（不能跨空行）
// 修改策略：允许内容中有多个换行，但不能有连续的两个换行（空行）
const blockRule = /^(\$\$)((?:(?!\n\n)[\s\S])*?)\1(?=\s|$)/;

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
            level: 'block', // 改回 block level
            start(src: string) {
                const index = src.indexOf('$$');
                return index >= 0 ? index : undefined;
            },
            tokenizer(src: string, tokens: Token[]) {
                // 手动查找配对的 $$
                if (!src.startsWith('$$')) {
                    return undefined;
                }
                
                // 找到第一个结束的 $$（从第2个字符开始搜索，跳过开头的 $$）
                let endIndex = -1;
                let searchStart = 2;
                
                while (true) {
                    const idx = src.indexOf('$$', searchStart);
                    if (idx === -1) break;
                    
                    // 检查这个 $$ 后面是否跟着空白或行尾
                    const after = src[idx + 2];
                    if (!after || after === '\n' || after === ' ' || after === '\t') {
                        endIndex = idx;
                        break;
                    }
                    
                    searchStart = idx + 2;
                }
                
                if (endIndex === -1) {
                    // 没找到结束符，可能是跨段落了
                    // 尝试在接下来的 tokens 中查找
                    console.log('[BlockMath] Trying to find closing $$ across paragraphs');
                    
                    // 收集后续的文本直到找到 $$
                    let fullText = src;
                    let foundClosing = false;
                    
                    // 检查接下来的几个 token
                    for (let i = 0; i < Math.min(5, tokens.length); i++) {
                        const nextToken = tokens[i] as any;
                        if (nextToken && nextToken.raw) {
                            fullText += '\n\n' + nextToken.raw;
                            if (nextToken.raw.includes('$$')) {
                                foundClosing = true;
                                break;
                            }
                        }
                    }
                    
                    if (foundClosing) {
                        // 重新查找结束符
                        const closingIdx = fullText.indexOf('$$', 2);
                        if (closingIdx !== -1) {
                            endIndex = closingIdx;
                            src = fullText;
                        }
                    }
                    
                    if (endIndex === -1) {
                        console.log('[BlockMath] No closing $$ found');
                        return undefined;
                    }
                }
                
                const raw = src.substring(0, endIndex + 2);
                const text = src.substring(2, endIndex).trim();
                
                console.log('[BlockMath] Found formula:', { textLength: text.length, hasNewline: text.includes('\n'), hasEmptyLine: text.includes('\n\n') });
                
                // 忽略空内容
                if (!text || text.length === 0) {
                    return undefined;
                }
                
                // 避免误匹配过于简单的内容
                if (!text.includes('\n') && text.length < 2) {
                    return undefined;
                }
                
                return {
                    type: 'BlockMath',
                    raw: raw,
                    text: text,
                    displayMode: true
                };
            },
            renderer: (token: Tokens.Generic) => {
                return this.renderer(token, false);
            }
        };
    }
}
