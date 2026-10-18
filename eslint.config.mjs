// Obsidian's own lint rules for community plugins: npm run lint
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "node_modules/", "test-vault/", "tests/", "scripts/", "*.mjs"] },
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.*"] },
			},
		},
		rules: {
			// Names that keep their capitals, and setting names quoted in help text.
			"obsidianmd/ui/sentence-case": ["warn", {
				brands: ["Obsidian", "ABC Sol-fa", "Kodály", "Dorian", "Mixolydian"],
				ignoreRegex: ['"[^"]*"'],
			}],
		},
	},
]);
