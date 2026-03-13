import { DELETE_EVENT_PROMPT } from "../prompts/delete-event-prompt.js";
import { getTimezoneOffsetInHours } from "../utils/get-timezone-offset-in-hours.js";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod/v3";

//#region src/tools/google_calendar/commands/run-delete-events.ts
const deleteEventSchema = z.object({
	event_id: z.string().optional(),
	event_summary: z.string().optional(),
	time_min: z.string().optional(),
	time_max: z.string().optional(),
	user_timezone: z.string()
});
const deleteEvent = async (calendarId, eventId, calendar) => {
	try {
		await calendar.events.delete({
			calendarId,
			eventId
		});
		return "Event deleted successfully";
	} catch (error) {
		return `An error occurred: ${error}`;
	}
};
const runDeleteEvent = async (query, { calendarId, calendar, model }, runManager) => {
	const prompt = new PromptTemplate({
		template: DELETE_EVENT_PROMPT,
		inputVariables: [
			"date",
			"query",
			"u_timezone",
			"dayName"
		]
	});
	if (!model?.withStructuredOutput) throw new Error("Model does not support structured output");
	const deleteEventChain = prompt.pipe(model.withStructuredOutput(deleteEventSchema));
	const date = (/* @__PURE__ */ new Date()).toISOString();
	const u_timezone = getTimezoneOffsetInHours();
	const dayName = (/* @__PURE__ */ new Date()).toLocaleString("en-us", { weekday: "long" });
	const { event_id, event_summary, time_min, time_max } = await deleteEventChain.invoke({
		query,
		date,
		u_timezone,
		dayName
	}, runManager?.getChild());
	if (event_id) return deleteEvent(calendarId, event_id, calendar);
	if (event_summary || time_min && time_max) try {
		const items = (await calendar.events.list({
			calendarId,
			timeMin: time_min,
			timeMax: time_max,
			q: event_summary,
			singleEvents: true
		})).data.items || [];
		if (items.length === 0) return "No events found matching the description.";
		if (items.length === 1 && items[0].id) return deleteEvent(calendarId, items[0].id, calendar);
		if (items.length > 1) return `Multiple events found. Please be more specific:\n${items.map((event) => `- ${event.summary} (${event.start?.dateTime || event.start?.date})`).join("\n")}`;
	} catch (error) {
		return `An error occurred while searching for the event: ${error}`;
	}
	return "Could not extract event details to delete. Please provide an event ID or a description with time.";
};

//#endregion
export { runDeleteEvent };
//# sourceMappingURL=run-delete-events.js.map