---
alwaysApply: true
scene: git_message
---

Write your rules here to customize the style of AI-generated commit messages.
严格遵循以下格式：
<type>（<范围>）: <简短描述>

1、<改动点一>
2、<改动点二>
3、<改动点三>

要求：
- type 使用 feat / fix / docs / style / refactor / perf / test / chore 等
- 范围写功能模块或页面名称
- 标题一句话概括，不超过 50 字
- 正文用「1、2、3、」编号，每点一句话说清改了什么
- 用中文，不要用 markdown 符号，不要加额外说明