
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const USE_LOCAL_OAUTH: string;
	export const CLAUDE_CODE_TERMINAL_MCP_TOOLS: string;
	export const AI_AGENT: string;
	export const USER: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const GIT_EDITOR: string;
	export const CLAUDE_CODE_EAGER_FLUSH: string;
	export const CLAUDE_AGENT_SDK_VERSION: string;
	export const CLAUDE_CODE_SESSION_ATTENDED: string;
	export const SHLVL: string;
	export const CLAUDE_CODE_MESSAGING_TOKEN: string;
	export const HOME: string;
	export const DISABLE_MICROCOMPACT: string;
	export const OLDPWD: string;
	export const USE_STAGING_OAUTH: string;
	export const CLAUDE_CODE_DESKTOP_APP_VERSION: string;
	export const CLAUDE_SSH_DAEMON_CHILD: string;
	export const CLAUDE_CODE_CHILD_SESSION: string;
	export const DBUS_SESSION_BUS_ADDRESS: string;
	export const WSL_DISTRO_NAME: string;
	export const CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: string;
	export const CLAUDE_CODE_HOST_SESSION_ID: string;
	export const WAYLAND_DISPLAY: string;
	export const API_TIMEOUT_MS: string;
	export const LOGNAME: string;
	export const CLAUDE_CODE_SIMPLE: string;
	export const PYTHONDONTWRITEBYTECODE: string;
	export const NAME: string;
	export const WSL_INTEROP: string;
	export const PULSE_SERVER: string;
	export const _: string;
	export const ANTHROPIC_BASE_URL: string;
	export const TERM: string;
	export const CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL: string;
	export const CLAUDE_CODE_USER_EMAIL: string;
	export const CLAUDE_CODE_ACCOUNT_UUID: string;
	export const CLAUDE_CODE_REPORT_FINDINGS: string;
	export const CLAUDE_AGENT_SDK_MCP_NO_PREFIX: string;
	export const MCP_CONNECTION_NONBLOCKING: string;
	export const PATH: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const XDG_RUNTIME_DIR: string;
	export const CLAUDE_CODE_ORGANIZATION_UUID: string;
	export const CLAUDE_EFFORT: string;
	export const DISPLAY: string;
	export const MCP_SERVER_CONNECTION_BATCH_SIZE: string;
	export const CLAUDE_PID: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const CLAUDE_SSH_CHILD: string;
	export const LANG: string;
	export const SHELL: string;
	export const NODE_PATH: string;
	export const CLAUDE_PREVIEW_CLASSIFIER_FLOOR: string;
	export const CLAUDE_CODE_DISABLE_TERMINAL_TITLE: string;
	export const CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES: string;
	export const CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: string;
	export const CLAUDE_CODE_SESSION_ID: string;
	export const CLAUDE_CODE_DISABLE_CRON: string;
	export const CLAUDECODE: string;
	export const CLAUDE_CODE_OAUTH_SCOPES: string;
	export const PWD: string;
	export const DISABLE_AUTOUPDATER: string;
	export const CLAUDE_CODE_EXECPATH: string;
	export const CLAUDE_SSH_RUN_DIR: string;
	export const WSL2_GUI_APPS_ENABLED: string;
	export const HOSTTYPE: string;
	export const CLAUDE_CODE_MESSAGING_SOCKET: string;
	export const WSLENV: string;
	export const NODE_ENV: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		USE_LOCAL_OAUTH: string;
		CLAUDE_CODE_TERMINAL_MCP_TOOLS: string;
		AI_AGENT: string;
		USER: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		GIT_EDITOR: string;
		CLAUDE_CODE_EAGER_FLUSH: string;
		CLAUDE_AGENT_SDK_VERSION: string;
		CLAUDE_CODE_SESSION_ATTENDED: string;
		SHLVL: string;
		CLAUDE_CODE_MESSAGING_TOKEN: string;
		HOME: string;
		DISABLE_MICROCOMPACT: string;
		OLDPWD: string;
		USE_STAGING_OAUTH: string;
		CLAUDE_CODE_DESKTOP_APP_VERSION: string;
		CLAUDE_SSH_DAEMON_CHILD: string;
		CLAUDE_CODE_CHILD_SESSION: string;
		DBUS_SESSION_BUS_ADDRESS: string;
		WSL_DISTRO_NAME: string;
		CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: string;
		CLAUDE_CODE_HOST_SESSION_ID: string;
		WAYLAND_DISPLAY: string;
		API_TIMEOUT_MS: string;
		LOGNAME: string;
		CLAUDE_CODE_SIMPLE: string;
		PYTHONDONTWRITEBYTECODE: string;
		NAME: string;
		WSL_INTEROP: string;
		PULSE_SERVER: string;
		_: string;
		ANTHROPIC_BASE_URL: string;
		TERM: string;
		CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL: string;
		CLAUDE_CODE_USER_EMAIL: string;
		CLAUDE_CODE_ACCOUNT_UUID: string;
		CLAUDE_CODE_REPORT_FINDINGS: string;
		CLAUDE_AGENT_SDK_MCP_NO_PREFIX: string;
		MCP_CONNECTION_NONBLOCKING: string;
		PATH: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		XDG_RUNTIME_DIR: string;
		CLAUDE_CODE_ORGANIZATION_UUID: string;
		CLAUDE_EFFORT: string;
		DISPLAY: string;
		MCP_SERVER_CONNECTION_BATCH_SIZE: string;
		CLAUDE_PID: string;
		NoDefaultCurrentDirectoryInExePath: string;
		CLAUDE_SSH_CHILD: string;
		LANG: string;
		SHELL: string;
		NODE_PATH: string;
		CLAUDE_PREVIEW_CLASSIFIER_FLOOR: string;
		CLAUDE_CODE_DISABLE_TERMINAL_TITLE: string;
		CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES: string;
		CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: string;
		CLAUDE_CODE_SESSION_ID: string;
		CLAUDE_CODE_DISABLE_CRON: string;
		CLAUDECODE: string;
		CLAUDE_CODE_OAUTH_SCOPES: string;
		PWD: string;
		DISABLE_AUTOUPDATER: string;
		CLAUDE_CODE_EXECPATH: string;
		CLAUDE_SSH_RUN_DIR: string;
		WSL2_GUI_APPS_ENABLED: string;
		HOSTTYPE: string;
		CLAUDE_CODE_MESSAGING_SOCKET: string;
		WSLENV: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
