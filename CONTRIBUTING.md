# Contributing to Cardscape

Bug reports, documentation improvements, sample workshops, and code changes are welcome.

## Report a bug or suggest a feature

Check for an existing issue. For a bug, include your Cardscape version or commit, operating system, steps to reproduce it, and what you expected to happen. A short clip or a small `.cardproj` or `.cardworkshop` can help reproduce a rendering or animation issue. For a feature, describe the card-making workflow it would improve. [GitHub Issues](https://github.com/RainLib/Cardscape/issues)

## Set up a development branch

Fork Cardscape and clone your fork. Replace `YOUR-USERNAME` with the owner of your fork. [GitHub guide to forks](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo)

```sh
git clone https://github.com/YOUR-USERNAME/Cardscape.git
cd Cardscape
git switch -c feature/short-description
```

Install Node.js 22.18 or newer and a stable Rust toolchain with Rust 2024 edition support. From the repository root, run the following commands to launch the editor with hot reload. [Editor development guide](editor/README.md#development)

```sh
cd editor
npm ci
npm run native:build
npm run dev
```

## Check your changes

For code changes, run these checks from `editor` after building the native worker.

```sh
npm run check
npm test
```

- For Rust changes, rebuild the worker with `npm run native:build` and run `npm run native:test`.
- For interface text, add an English translation and check the editor in English and Simplified Chinese. [Translation catalog](editor/renderer/localization/ui-catalog.ts)
- For visual changes, verify the result in a workshop and capture the affected view or animation. For sample workshops, share assets you have permission to redistribute and credit the artwork, fonts, and audio you use.
- For documentation only, preview the Markdown and check the links and any commands you changed.

## Open a pull request

Stage and commit the files for your change, then push your branch to your fork.

```sh
git push -u origin feature/short-description
```

Open a pull request with `RainLib/Cardscape` and `main` as the base. Choose your fork and its feature branch as the source. Describe what changed and why, list the checks you ran, and include screenshots, a clip, or a sample workshop when they help reviewers see the result. Link the related issue if there is one. [Create a pull request](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request-from-a-fork)
