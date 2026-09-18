import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENGINE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)));

const FORBIDDEN = [
	'from "react"',
	"from 'react'",
	'from "react-dom"',
	"from 'react-dom'",
	'from "astro"',
	"from 'astro'",
	"from 'astro:",
	'from "astro:',
	'from "@supabase',
	"from '@supabase",
];

async function listTsFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listTsFiles(full)));
			continue;
		}
		if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
			continue;
		}
		if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
			files.push(full);
		}
	}
	return files;
}

describe("engine purity", () => {
	it("does not import React, Astro, or DOM-bound frameworks", async () => {
		const files = await listTsFiles(ENGINE_ROOT);
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const source = await readFile(file, "utf8");
			for (const needle of FORBIDDEN) {
				expect(source, `${path.relative(ENGINE_ROOT, file)} contains ${needle}`).not.toContain(
					needle,
				);
			}
		}
	});
});
