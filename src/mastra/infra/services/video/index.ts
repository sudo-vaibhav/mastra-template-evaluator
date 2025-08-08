import { inject, injectable } from "inversify";
import { JSDOM } from "jsdom";
import { Config } from "../../../domain/aggregates/config.js";

@injectable()
export class VideoService {
  @inject(Config)
  config!: Config;

  async getTranscript(videoId: string): Promise<string> {
    const response = await fetch(
      `https://youtubetotranscript.com/transcript?v=${videoId}`
    );
    if (!response.ok) {
      console.error(
        `Failed to fetch transcript for video ${videoId}:`,
        response.statusText,
        response.body
      );
      throw new Error(`Failed to fetch transcript for video ${videoId}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const article = dom.window.document.querySelector("article");

    if (!article) {
      throw new Error(`No article tag found in response for video ${videoId}`);
    }

    return article.innerText || "";
  }
}