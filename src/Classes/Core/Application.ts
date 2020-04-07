/*
 * Copyright 2020 LABOR.digital
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Last modified: 2020.04.03 at 18:57
 */

import {EventBus} from "@labor-digital/helferlein/lib/Events/EventBus";
import {forEach} from "@labor-digital/helferlein/lib/Lists/forEach";
import {isArray} from "@labor-digital/helferlein/lib/Types/isArray";
import {isEmpty} from "@labor-digital/helferlein/lib/Types/isEmpty";
import {isFunction} from "@labor-digital/helferlein/lib/Types/isFunction";
import {isObject} from "@labor-digital/helferlein/lib/Types/isObject";
import {isPlainObject} from "@labor-digital/helferlein/lib/Types/isPlainObject";
import {isString} from "@labor-digital/helferlein/lib/Types/isString";
import {isUndefined} from "@labor-digital/helferlein/lib/Types/isUndefined";
import chalk from "chalk";
import {Command} from "commander";
// @ts-ignore
import requireg from "requireg";
import {Platform} from "../Api/Platform";
import {AppContext} from "./AppContext";
import {AppEventList} from "./AppEventList";
import {AppRegistry} from "./AppRegistry";
import {CommandHandler} from "./Command/CommandHandler";
import {CommandRegistry} from "./Command/CommandRegistry";
import {DefaultCommands} from "./Command/DefaultCommands";
import {ConfigLoader} from "./Configuration/ConfigLoader";
import {FileFinder} from "./FileFinder";
import {Registry} from "./Registry";

export class Application {
	
	/**
	 * The main application controller
	 */
	public run(): Promise<AppContext> {
		let context: AppContext | null = null;
		return this.createNewAppContext()
			.then(c => context = c)
			.then(c => this.showFancyIntro(c))
			.then(c => DefaultCommands.make(c))
			.then(c => this.loadExtensions(c))
			.then(c => context.emitSequentialHook(AppEventList.AFTER_EXTENSIONS_LOADED, c))
			.then(c => this.handleMigration(c))
			.then(c => this.handleCommand(c))
			.then(() => process.exit())
			.catch(err => {
				if (isObject(err) && !isUndefined(err.stack)) err = err.stack;
				console.error("");
				console.error(chalk.redBright("A FATAL ERROR OCCURRED!\r\nSadly I could not recover :(\r\n"));
				console.error(chalk.redBright(err));
				console.error("");
				process.exit(1);
				return context;
			});
	}
	
	/**
	 * Creates a new app config instance
	 */
	protected createNewAppContext(): Promise<AppContext> {
		return Promise.resolve(new AppContext(
			new Command(),
			require("../../../package.json").version,
			EventBus.getEmitter(),
			new Platform(),
			new FileFinder(),
			new Registry(),
			new AppRegistry(),
			new ConfigLoader(),
			new CommandRegistry()
		));
	}
	
	/**
	 * Renders a nice into for our application
	 * @param context
	 */
	protected showFancyIntro(context: AppContext): Promise<AppContext> {
		const lang = [
			["Guten Morgen", "Guten Tag", "Guten Abend"],
			["Good morning", "Good day", "Good evening"],
			["Buenos días", "Buenos días", "Buenas noches"],
			["Bonjour", "Bonne journée", "Bonsoir"],
			["Godmorgen", "God dag", "God aften"],
			["Dobro jutro", "Dobar dan", "Dobra večer"],
			["Maidin mhaith", "Dea-lá", "Dea-oíche"],
			["Buongiorno", "Buona giornata", "Buona sera"],
			["Günaydın", "Iyi günler", "İyi aksamlar"]
		];
		const h = new Date().getHours();
		const timeKey = h < 12 ? 0 : (h < 18 ? 1 : 2);
		const langKey = (Math.floor(Math.random() * lang.length));
		const prefix = lang[langKey][timeKey];
		console.log(prefix + ", you are using LAB " + context.version);
		return Promise.resolve(context);
	}
	
	/**
	 * Loads the extensions that were registered in the configuration object
	 * @param context
	 */
	protected loadExtensions(context: AppContext): Promise<AppContext> {
		return new Promise<AppContext>(resolve => {
			
			// Check if we have configured extensions
			const extensionsNames = context.config.get("extensions", []);
			if (!isArray(extensionsNames) || isEmpty(extensionsNames)) return resolve(context);
			
			// Gather the required extensions
			context.eventEmitter.unbindAll(AppEventList.EXTENSION_LOADING);
			forEach(extensionsNames, (extensionName: string) => {
				try {
					if (!isString(extensionName)) throw new Error("Invalid extension name given!");
					let extension = requireg(extensionName);
					if (!isFunction(extension)) {
						if (isPlainObject(extension) && isFunction(extension.default)) extension = extension.default;
						else throw new Error("The extension did not export a function!");
					}
					context.eventEmitter.bind(AppEventList.EXTENSION_LOADING, () => {
						return extension(context);
					});
				} catch (e) {
					if (isUndefined(e)) e = new Error(e);
					console.log(chalk.redBright("Error while loading extension: " + extensionName + "! " + e.message));
				}
			});
			
			// Trigger the extension import
			return context.eventEmitter.emitHook(AppEventList.EXTENSION_LOADING, {})
				.then(() => context);
			
		});
	}
	
	/**
	 * Allows for upcoming version migration between app versions
	 * @param context
	 */
	protected handleMigration(context: AppContext): Promise<AppContext> {
		const currentVersion = context.version;
		const storedVersion = context.registry.get("version");
		if (currentVersion === storedVersion) return Promise.resolve(context);
		
		// Allow extensions to handle migrations
		return context.emitSequentialHook(AppEventList.MIGRATE, {
			currentVersion,
			storedVersion
		}).then(() => {
			// Update the stored version
			context.registry.set("version", context.version);
			return context;
		});
	}
	
	/**
	 * Handle the required command based on the registered commands
	 * @param context
	 */
	protected handleCommand(context: AppContext): Promise<AppContext> {
		return (new CommandHandler()).handle(context);
	}
}