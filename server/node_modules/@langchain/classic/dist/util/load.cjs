
//#region src/util/load.ts
const loadFromFile = async (uri, loader, values = {}) => {
	try {
		return loader(await (await import("node:fs/promises")).readFile(uri, { encoding: "utf-8" }), uri, values);
	} catch (e) {
		console.error(e);
		throw new Error(`Could not load file at ${uri}`);
	}
};

//#endregion
exports.loadFromFile = loadFromFile;
//# sourceMappingURL=load.cjs.map