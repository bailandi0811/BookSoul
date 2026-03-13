const require_runtime = require('../../../_virtual/_rolldown/runtime.cjs');
const require_create_event_prompt = require('../prompts/create-event-prompt.cjs');
const require_get_timezone_offset_in_hours = require('../utils/get-timezone-offset-in-hours.cjs');
let _langchain_core_prompts = require("@langchain/core/prompts");
let zod_v3 = require("zod/v3");

//#region src/tools/google_calendar/commands/run-create-events.ts
const eventSchema = zod_v3.z.object({
	event_summary: zod_v3.z.string(),
	event_start_time: zod_v3.z.string(),
	event_end_time: zod_v3.z.string(),
	event_location: zod_v3.z.string().optional(),
	event_description: zod_v3.z.string().optional(),
	user_timezone: zod_v3.z.string()
});
const createEvent = async ({ eventSummary, eventStartTime, eventEndTime, userTimezone, eventLocation = "", eventDescription = "" }, calendarId, calendar) => {
	const event = {
		summary: eventSummary,
		location: eventLocation,
		description: eventDescription,
		start: {
			dateTime: eventStartTime,
			timeZone: userTimezone
		},
		end: {
			dateTime: eventEndTime,
			timeZone: userTimezone
		}
	};
	try {
		return await calendar.events.insert({
			calendarId,
			requestBody: event
		});
	} catch (error) {
		return { error: `An error occurred: ${error}` };
	}
};
const runCreateEvent = async (query, { calendarId, calendar, model }, runManager) => {
	const prompt = new _langchain_core_prompts.PromptTemplate({
		template: require_create_event_prompt.CREATE_EVENT_PROMPT,
		inputVariables: [
			"date",
			"query",
			"u_timezone",
			"dayName"
		]
	});
	if (!model?.withStructuredOutput) throw new Error("Model does not support structured output");
	const createEventChain = prompt.pipe(model.withStructuredOutput(eventSchema));
	const date = (/* @__PURE__ */ new Date()).toISOString();
	const u_timezone = require_get_timezone_offset_in_hours.getTimezoneOffsetInHours();
	const dayName = (/* @__PURE__ */ new Date()).toLocaleString("en-us", { weekday: "long" });
	const output = await createEventChain.invoke({
		query,
		date,
		u_timezone,
		dayName
	}, runManager?.getChild());
	const [eventSummary, eventStartTime, eventEndTime, eventLocation, eventDescription, userTimezone] = Object.values(output);
	const event = await createEvent({
		eventSummary,
		eventStartTime,
		eventEndTime,
		userTimezone,
		eventLocation,
		eventDescription
	}, calendarId, calendar);
	if (!event.error) return `Event created successfully, details: event ${event.data.htmlLink}`;
	return `An error occurred creating the event: ${event.error}`;
};

//#endregion
exports.runCreateEvent = runCreateEvent;
//# sourceMappingURL=run-create-events.cjs.map