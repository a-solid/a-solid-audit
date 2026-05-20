# refactor
## Steps

1. Audit skill启动audit server
2. 用户打开网页
3. audit server扫描当前项目的历史audit数据
3. 网页里支持选择历史的audit查看或者开启一轮新的audit
4. 新的audit则audit server创建基础目录和元数据信息到yaml
5. 网页里展示最新的10个commit和branch信息
6. 网页里让用户选择audit的scope，可以是选择commit或者选择未提交的改动或者选择两个branch去audit
7. 选择好后audit server执行git命令获取文件和diff 写入到yaml中
8. 网页里问用户是否要review story
9. 是则展示输入框 然后让用户输入story信息，主要包括描述和ac；或者渲染下当前的provider，比如jira，让用户输入jira story id，然后调用jira去拉取需求描述然后存储到yaml
10. 再展示当前的diff文件名和story，让用户吧文件和story关联起来，确认后写入yaml。
11. 提示一切准备完成，用户可以在chat里输入go之类 开始让AI进行review
12. 网页渲染整个review的进度
13. AI基于Audit skILL对代码yaml和story yaml依次review，更新状态
14. 网页持续拉取yaml的状态然后渲染
15. 用户可以在网页里对结果进行confirm，dismiss 以及添加comment
16. 最终可以在最后的summary页面进行sign off，然后导出PDF