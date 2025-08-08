import { inject, injectable } from "inversify";
import { JSDOM } from "jsdom";
import { Config } from "../../../domain/aggregates/config.js";

@injectable()
export class VideoService{
    @inject(Config)
    config!: Config;

    async getTranscript(videoURL: string): Promise<string> {
        // Placeholder for actual implementation
        // const apiKey = this.config.YT_TRANSCRIPT_API_KEY;
        const response = await fetch(`http://youtubetotranscript.com/transcript?v=${videoURL}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch transcript for video ${videoURL}`);
        }

        const html = await response.text();
        const dom = new JSDOM(html);
        const article = dom.window.document.querySelector('article');
        
        if (!article) {
            throw new Error(`No article tag found in response for video ${videoURL}`);
        }

        return article.innerText || '';
    }
}