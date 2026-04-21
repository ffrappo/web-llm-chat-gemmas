<div align="center">

# Fornace WebLLM Chat

<a href="https://fornacestudio.com"><img alt="Fornace Studio" src="https://img.shields.io/badge/Fornace_Studio-Website-fafbfc?logo=firefox"></a>

**Private AI Conversations, Fully In-Browser.**

Your messages and data never leave your computer. A full-featured AI runs directly in your browser — no internet connection required after the first model download.

</div>

## Overview

**Fornace WebLLM Chat** is a private AI chat interface that runs large language models (LLMs) natively in your browser using WebGPU. Enjoy an unprecedented, private, and accessible AI conversation experience — completely serverless.

## Key Features

- **Browser-Native AI**: Experience cutting-edge language models running natively within your web browser with WebGPU acceleration, eliminating the need for server-side processing or cloud dependencies.
- **Guaranteed Privacy**: With the AI model running locally on your hardware and all data processing happening within your browser, your data and conversations never leave your computer, ensuring your privacy.
- **Offline Accessibility**: Run entirely offline after the initial setup and download, allowing you to engage with AI-powered conversations without an active internet connection.
- **Vision Model Support**: Chat with AI by uploading and sending images, making it easy to get insights and answers based on visual content.
- **User-Friendly Interface**: Enjoy the intuitive and feature-rich user interface, complete with markdown support, dark mode, and a responsive design optimized for various screen sizes.
- **Custom Models**: Connect to any custom language model on your local environment through MLC-LLM.
- **Open Source and Customizable**: Build and customize your own AI-powered applications with our open-source framework.

## Built-in Models

Fornace WebLLM Chat natively supports WebLLM built-in models.

## Development

```shell
# 1. install nodejs and yarn first
# 2. config local env vars in `.env.local`
# 3. run
yarn install
yarn dev
```

## Deployment

### Build

You can build the application as a Next.js build using `yarn build` or as a static site using `yarn export`.

### Docker

```shell
docker build -t fornace-webllm-chat .
docker run -d -p 3000:3000 fornace-webllm-chat
```

## Acknowledgements

Fornace WebLLM Chat is a fork of [NextChat](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web), originally built by the MLC.ai team as WebLLM Chat. Maintained by [Fornace Studio](https://fornacestudio.com).

We extend our sincere gratitude to the developers and contributors of NextChat and the original WebLLM Chat for their invaluable efforts in advancing browser-based AI and creating user-friendly chat interfaces.

Further more, this project is only possible thanks to the shoulders of open-source ecosystems that we stand on. We want to thank the Apache TVM community and developers of the TVM Unity effort. The open-source ML community members made these models publicly available. PyTorch and Hugging Face communities make these models accessible. We would like to thank the teams behind Vicuna, SentencePiece, LLaMA, Alpaca. We also would like to thank the WebAssembly, Emscripten, and WebGPU communities. Finally, thanks to Dawn and WebGPU developers.
