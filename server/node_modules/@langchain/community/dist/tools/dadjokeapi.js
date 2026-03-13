import { __exportAll } from "../_virtual/_rolldown/runtime.js";
import { Tool } from "@langchain/core/tools";

//#region src/tools/dadjokeapi.ts
var dadjokeapi_exports = /* @__PURE__ */ __exportAll({ DadJokeAPI: () => DadJokeAPI });
/**
* The DadJokeAPI class is a tool for generating dad jokes based on a
* specific topic. It fetches jokes from an external API and returns a
* random joke from the results. If no jokes are found for the given
* search term, it returns a message indicating that no jokes were found.
*/
var DadJokeAPI = class extends Tool {
	static lc_name() {
		return "DadJokeAPI";
	}
	name = "dadjoke";
	description = "a dad joke generator. get a dad joke about a specific topic. input should be a search term.";
	/** @ignore */
	async _call(input) {
		const headers = { Accept: "application/json" };
		const searchUrl = `https://icanhazdadjoke.com/search?term=${input}`;
		const response = await fetch(searchUrl, { headers });
		if (!response.ok) throw new Error(`HTTP error ${response.status}`);
		const jokes = (await response.json()).results;
		if (jokes.length === 0) return `No dad jokes found about ${input}`;
		return jokes[Math.floor(Math.random() * jokes.length)].joke;
	}
};

//#endregion
export { DadJokeAPI, dadjokeapi_exports };
//# sourceMappingURL=dadjokeapi.js.map