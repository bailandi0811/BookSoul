const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_base = require('./base.cjs');
const require_descriptions = require('./descriptions.cjs');
let zod_v3 = require("zod/v3");

//#region src/tools/gmail/search.ts
const searchSchema = zod_v3.z.object({
	query: zod_v3.z.string(),
	maxResults: zod_v3.z.number().optional(),
	resource: zod_v3.z.enum(["messages", "threads"]).optional()
});
var GmailSearch = class extends require_base.GmailBaseTool {
	name = "search_gmail";
	schema = searchSchema;
	description = require_descriptions.SEARCH_DESCRIPTION;
	constructor(fields) {
		super(fields);
	}
	async _call(arg) {
		const { query, maxResults = 10, resource = "messages" } = arg;
		try {
			const gmail = await this.getGmailClient();
			const { data } = await gmail.users.messages.list({
				userId: "me",
				q: query,
				maxResults
			});
			if (!data) throw new Error("No data returned from Gmail");
			const { messages } = data;
			if (!messages) throw new Error("No messages returned from Gmail");
			if (resource === "messages") {
				const parsedMessages = await this.parseMessages(gmail, messages);
				return `Result for the query ${query}:\n${JSON.stringify(parsedMessages)}`;
			} else if (resource === "threads") {
				const parsedThreads = await this.parseThreads(gmail, messages);
				return `Result for the query ${query}:\n${JSON.stringify(parsedThreads)}`;
			}
			throw new Error(`Invalid resource: ${resource}`);
		} catch (error) {
			throw new Error(`Error while searching Gmail: ${error}`);
		}
	}
	async parseMessages(gmail, messages) {
		return await Promise.all(messages.map(async (message) => {
			try {
				const { data } = await gmail.users.messages.get({
					userId: "me",
					format: "full",
					id: message.id ?? ""
				});
				const { payload } = data;
				const { subject, sender, body } = this.parseHeaderAndBody(payload);
				return {
					id: message.id,
					threadId: message.threadId,
					snippet: data.snippet,
					body,
					subject,
					sender
				};
			} catch (error) {
				throw new Error(`Error while fetching message: ${error}`);
			}
		}));
	}
	async parseThreads(gmail, messages) {
		return await Promise.all(messages.map(async (message) => {
			try {
				const { data: { messages } } = await gmail.users.threads.get({
					userId: "me",
					format: "full",
					id: message.threadId ?? ""
				});
				const { subject, sender, body } = this.parseHeaderAndBody(messages?.[0]?.payload);
				return {
					id: message.threadId,
					snippet: messages?.[0]?.snippet,
					body,
					subject,
					sender
				};
			} catch (error) {
				throw new Error(`Error while fetching thread: ${error}`);
			}
		}));
	}
};

//#endregion
exports.GmailSearch = GmailSearch;
//# sourceMappingURL=search.cjs.map