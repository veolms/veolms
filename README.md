# VeoLMS

VeoLMS is an open-source, self-hostable learning management system for educators, creators, and organizations. It brings course creation, learning, and academy management together in a platform you can run and adapt for your own needs.

The project is built around the idea that educators should have control over their brand, content, users, and data.

[Website](https://veolms.org/) · [Live demo](https://dev.veolms.org/) · [Development setup](docs/development.md) · [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md) · [License](LICENSE)

## What you can build

VeoLMS is designed to support the full learning journey, from publishing a course to helping learners track their progress:

- **Create and organize:** Build courses with sections and lessons, manage content, and prepare drafts for publication.
- **Teach and learn:** Deliver video lessons and quizzes, manage course access and enrollments, and track learning progress.
- **Engage learners:** Support discussions, notes, and notifications around course content.
- **Run your academy:** Manage users and staff permissions, courses, payments, and coupons.
- **Build on the platform:** Use the API and shared packages to adapt and extend VeoLMS for your own workflow.

Some capabilities depend on external services or configuration, and the project continues to evolve. The [live demo](https://dev.veolms.org/) offers a way to explore the current experience.

## Why VeoLMS?

- **Open source:** Explore the code, contribute improvements, and run the platform under the AGPL-3.0 license.
- **Your platform:** Self-host your academy and make decisions about its content, data, and presentation.
- **Built for learning:** Bring course management, video learning, progress, and community features together.
- **Community driven:** Help shape the project through code, design, feedback, and ideas.

## Set up for development

Choose an approach to get started:

### Option 1: Ask an agent to set it up

1. Create a new, empty folder on your computer and open that folder in your coding agent.
2. Give the agent this prompt:

   > Set up VeoLMS for local development in this folder. Read and follow the setup guide at https://github.com/veolms/veolms/blob/dev/docs/development.md. Check the prerequisites, clone the `dev` branch, configure the local environment, start the database, run migrations and seed, and start the app. Tell me what works and what needs my help.

### Option 2: Set it up manually

Follow the [development setup guide](docs/development.md) for prerequisites, installation commands, configuration, and troubleshooting.

## Project structure

- `apps/web` — React frontend
- `apps/api` — Fastify API
- `packages/` — shared contracts, database, configuration, and other workspace packages
- `docs/` — setup and development documentation

## Community and contributing

VeoLMS is built in public. You can help by reporting bugs, proposing ideas, improving design, and contributing code. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch, pull request, and test workflow, review our [Code of Conduct](CODE_OF_CONDUCT.md), or join the [Discord community](https://discord.com/invite/P2qXqXgrzb) to connect with others.

Please report vulnerabilities privately using the [security policy](SECURITY.md).

## License

VeoLMS is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).
