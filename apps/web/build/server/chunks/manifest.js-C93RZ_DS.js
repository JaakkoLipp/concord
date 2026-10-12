const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "app/_app",
	appPath: "app/_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"app/_app/immutable/entry/start.cSDvAmmI.js",app:"app/_app/immutable/entry/app.BEqyqY8Y.js",imports:["app/_app/immutable/entry/start.cSDvAmmI.js","app/_app/immutable/chunks/DfaXnAAO.js","app/_app/immutable/chunks/BGi8Mmo3.js","app/_app/immutable/entry/app.BEqyqY8Y.js","app/_app/immutable/chunks/BGi8Mmo3.js","app/_app/immutable/chunks/xihTtKlq.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js-DQGxgDpg.js')),
			__memo(() => import('./nodes/1.js-IDSpJtvd.js')),
			__memo(() => import('./nodes/2.js-BoxvkQcX.js')),
			__memo(() => import('./nodes/3.js-DnM6tHXn.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/(app)/app",
				pattern: /^\/app\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 3 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

export { manifest as m };
//# sourceMappingURL=manifest.js-C93RZ_DS.js.map
