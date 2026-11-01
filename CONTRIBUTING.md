# Contributing to VeoLMS

Thank you for helping improve VeoLMS. Contributions are welcome, including bug reports and improvements to accessibility, tests, and features. This guide explains how to get involved and prepare a change for review.

## Contribution policy

We welcome meaningful contributions that address a real problem or improve VeoLMS, such as fixing a bug, improving accessibility, adding useful functionality, or strengthening tests. Explain the value of your change in the pull request.

Do not submit pull requests solely to fix typos or change the README. Contributors who submit these changes may be blocked. Documentation updates needed to explain an accepted code or feature change can be included with that change.

## How to contribute

- **Report a bug:** Use a [GitHub issue template](https://github.com/veolms/veolms/issues/new/choose). Describe what you expected, what happened, and how to reproduce it. Include relevant versions and logs, with private information removed.
- **Suggest an improvement:** Open an issue describing the problem, who it affects, and your proposed idea. Discuss larger changes before starting so contributors and maintainers can agree on the direction.
- **Improve the project:** Pick an issue or make a focused improvement to code, design, accessibility, or tests. Check existing issues and pull requests to avoid duplicating work.
- **Help the community:** Review and test changes, answer questions, or join the [Discord community](https://discord.com/invite/P2qXqXgrzb) to share ideas.

For security vulnerabilities, follow the private reporting instructions in [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Set up your workspace

Follow the [development guide](docs/development.md) for prerequisites, setup, and testing. Read the repository's [AGENTS.md](AGENTS.md) and, when working in those applications, the relevant [web](apps/web/AGENTS.md) or [API](apps/api/AGENTS.md) instructions.

## Contribution workflow

1. **Choose a task.** Find an existing issue or describe your proposed change in a new one. For substantial work, discuss the approach before investing time in implementation.
2. **Create a branch.** Fork the repository if needed, start from an up-to-date `dev` branch, and create a branch prefixed with `feat/`, `fix/`, or `chore/`, such as `fix/course-access` or `feat/course-search`. Make changes on your branch and submit a pull request; do not commit directly to a protected branch.
3. **Make a focused change.** Follow the existing project patterns, update documentation when behavior or configuration changes, and include appropriate validation. Keep unrelated changes in separate pull requests.
4. **Check your work.** Run the checks relevant to the change. Before pushing to `dev`, run `pnpm test:all`. The [development guide](docs/development.md#checks) explains the test prerequisites and individual commands.
5. **Open a pull request against `dev`.** Explain the problem and solution, link related issues, and list the checks you ran and their results. Note any limitations, migration or configuration changes, and checks you could not run. Add screenshots or recordings when they help reviewers understand a user-facing change.
6. **Respond to review.** Discuss feedback, make any agreed changes, and keep the pull request up to date until it is ready to merge.

## Guidelines for contributions

- **Keep changes understandable.** Prefer small, cohesive changes and follow the conventions of the surrounding code. Explain significant trade-offs in the pull request.
- **Respect the monorepo boundaries.** Use `@veolms/contracts` for requests and responses shared by the frontend and API. Follow the application-specific instructions for frontend components and backend services and repositories.
- **Consider the people using the product.** Check affected user journeys, permissions, error states, and accessibility where relevant. Avoid exposing secrets or personal data in code, examples, screenshots, and logs.
- **Keep documentation current.** Update relevant guides when setup, configuration, commands, or behavior changes. Document any required migration or compatibility considerations.
- **Test behavior honestly.** Do not change, skip, or delete a test just to make a run pass. Investigate failures and explain what you found. The [repository test rules](AGENTS.md#tests-that-guard-features) include additional instructions for agents and covered features.
- **Use the right type of test.** API unit tests cover backend logic, flow tests exercise API journeys, and browser tests cover actions and outcomes a person experiences. Do not add frontend unit tests or browser tests for appearance alone. See the [flow test guide](apps/api/test/flows/README.md) and [browser test guide](apps/web/tests/journeys/README.md).
- **Be respectful and constructive.** Describe problems and feedback clearly, assume good intent, and give others time to respond.

## Commit message format

Use a concise message that describes the change. The project commonly uses this format:

```text
type(scope): short description
```

The scope is optional; choose a short area such as `web`, `api`, `database`, or `docs`. Use the imperative mood where practical, and add a commit body when the reason or context needs more explanation. Common types include `feat` for a feature, `fix` for a bug fix, `docs` for documentation, `test` for tests, `refactor` for restructuring, and `chore` for maintenance.

Examples:

```text
feat(web): add course search
fix(api): reject expired sign-in codes
docs: clarify local development setup
test(api): cover course access rules
```

## License

Contributions to this repository are made under the [GNU AGPL-3.0-only license](LICENSE). Only submit work you have the right to contribute under that license.
