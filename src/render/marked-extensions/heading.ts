/**
 * marked extension for heading
 * 
 * credits to Sun BooShi, author of note-to-mp plugin
 */

import { Tokens, MarkedExtension } from "marked";
import { WeWriteMarkedExtension } from "./extension";
import { sanitizeHTMLToDom } from "obsidian";

export class Heading extends WeWriteMarkedExtension {
	async postprocess(html: string) {
		const dom = sanitizeHTMLToDom(html)
		const tempDiv = createEl('div');
		tempDiv.appendChild(dom);
		const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
		let anchorIndex = 0;
		for (const heading of headings) {
			const text = heading.textContent
			// 插入唯一 id 属性，格式如 wewrite-anchor-0, wewrite-anchor-1 ...
			heading.setAttr('id', `wewrite-anchor-${anchorIndex}`);
			anchorIndex++;
			heading.empty()
			heading.createSpan({ text: " ", cls: 'wewrite-heading-prefix' })
			const outbox = heading.createSpan({ cls: 'wewrite-heading-outbox' })
			const leaf = outbox.createSpan({ text: text ? text : "", cls: 'wewrite-heading-leaf' })
			heading.createSpan({ cls: 'wewrite-heading-tail' })
		}
		return tempDiv.innerHTML

	}

	// async render(text: string, depth: number) {
	// 	console.log('heading=>', text);

	// 	return `
    //         <h${depth}>
	// 		<span class="wewrite-heading-prefix">
	// 		${depth}
	// 		  </span>
	// 		<span class="wewrite-heading-outbox">
	// 		<span class="wewrite-heading-leaf">
    //           ${text}
	// 		  </span>
	// 		  </span>
	// 		  <span class="wewrite-heading-tail">
	// 		  </span>
    //         </h${depth}>`;

	// }

	markedExtension(): MarkedExtension {
		return {
			extensions: []
		}
		// 	return {
		// 		async: true,
		// 		walkTokens: async (token: Tokens.Generic) => {
		// 			if (token.type !== 'heading') {
		// 				return;
		// 			}
		// 			token.html = await this.render(token.text, token.depth);
		// 		},
		// 		extensions: [{
		// 			name: 'heading',
		// 			level: 'block',

		// 			renderer(token: Tokens.Generic) {
		// 				return token.html;
		// 			}
		// 		}]
		// 	}
		// }
	}
}
