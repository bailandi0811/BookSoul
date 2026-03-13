//#region src/tools/google_calendar/utils/get-timezone-offset-in-hours.ts
const getTimezoneOffsetInHours = () => {
	return -(/* @__PURE__ */ new Date()).getTimezoneOffset() / 60;
};

//#endregion
export { getTimezoneOffsetInHours };
//# sourceMappingURL=get-timezone-offset-in-hours.js.map