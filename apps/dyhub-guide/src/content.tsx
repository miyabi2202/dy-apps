import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { colors, space } from '@dy-apps/ui/tokens.stylex';
import { C, Callout, Cmd, Kbd, OpenLink, Out } from './ui/blocks';

export interface GuideSection {
  id: string;
  title: string;
  /** Numbered install steps get a number badge and a "done" toggle. */
  step?: number;
  body: ReactNode;
}

const CLONE_URL = 'https://cnb.cool/miyabi2202/dy-hubs.git';

function H3({ children }: { children: ReactNode }) {
  return <h3 {...stylex.props(s.h3)}>{children}</h3>;
}

function P({ children }: { children: ReactNode }) {
  return <p {...stylex.props(s.p)}>{children}</p>;
}

function Ol({ children }: { children: ReactNode }) {
  return <ol {...stylex.props(s.list)}>{children}</ol>;
}

/** A link to another section of the guide. */
function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} {...stylex.props(s.a)}>
      {children}
    </a>
  );
}

function Ul({ children }: { children: ReactNode }) {
  return <ul {...stylex.props(s.list)}>{children}</ul>;
}

/** "Command not found" fixes shared by steps 3 and 5. */
function NotFoundFixes() {
  return (
    <Ol>
      <li>关掉所有命令提示符窗口，重新打开一个再试</li>
      <li>还不行就重启电脑再试</li>
      <li>仍然不行，重新运行安装包，确认每一步都是默认选项</li>
    </Ol>
  );
}

export const SECTIONS: GuideSection[] = [
  {
    id: 'concepts',
    title: '先了解几个小概念',
    body: (
      <>
        <Ul>
          <li>
            <b>命令提示符</b>：Windows
            自带的一个黑色窗口，可以在里面输入文字命令让电脑做事。本教程大部分操作都在这个窗口里完成。
          </li>
          <li>
            <b>命令</b>：教程里深色方框中的文字就是命令。你只需要点旁边的<b>复制</b>按钮，
            <b>粘贴</b>到命令提示符窗口里，然后按<b>回车键（Enter）</b>。
          </li>
          <li>
            <b>Git</b>：一个下载代码的工具，我们用它把 DyHub 的程序下载到你的电脑上。
          </li>
          <li>
            <b>Node.js</b>：运行 DyHub 所需要的软件环境，就像玩游戏需要先装运行库一样。
          </li>
          <li>
            <b>npm</b>：安装 Node.js 时会自动附带，用来下载 DyHub 需要的零部件（叫“依赖”）。
          </li>
        </Ul>
        <H3>如何在命令提示符里粘贴</H3>
        <Ul>
          <li>
            方法一：按 <Kbd>Ctrl</Kbd> + <Kbd>V</Kbd>
          </li>
          <li>
            方法二：在窗口里<b>点鼠标右键</b>，会直接粘贴
          </li>
        </Ul>
        <Callout kind="warn">
          命令请一个字符都不要改，包括空格和标点。建议直接用复制按钮，不要手打。
        </Callout>
        <P>
          教程里还有一种<b>虚线框</b>，标着“你会看到”，那是电脑显示给你看的结果，
          <b>不需要输入</b>。
        </P>
      </>
    ),
  },
  {
    id: 'step-1',
    step: 1,
    title: '打开命令提示符',
    body: (
      <>
        <H3>方法一（推荐）</H3>
        <Ol>
          <li>
            同时按下键盘上的 <Kbd>Win</Kbd> 键（键盘左下角带 Windows 图标的键）和 <Kbd>R</Kbd> 键
          </li>
          <li>
            弹出“运行”小窗口，在输入框里输入 <C>cmd</C>
          </li>
          <li>按回车</li>
        </Ol>
        <H3>方法二</H3>
        <Ol>
          <li>点击屏幕左下角的“开始”按钮（或放大镜搜索图标）</li>
          <li>
            输入 <C>cmd</C> 或 <C>命令提示符</C>
          </li>
          <li>点击搜索结果中的“命令提示符”</li>
        </Ol>
        <P>打开后会看到一个黑色窗口，里面有一行类似这样的文字：</P>
        <Out>{'C:\\Users\\你的用户名>'}</Out>
        <P>这说明命令提示符已经准备好，可以输入命令了。</P>
        <Callout>
          本教程请使用“命令提示符”，<b>不要</b>使用“PowerShell”或“Windows PowerShell”（开头带{' '}
          <C>PS</C> 的窗口）。PowerShell 默认的安全设置会拦截后面要用的 <C>npm</C>{' '}
          命令，新手容易卡住。
        </Callout>
      </>
    ),
  },
  {
    id: 'step-2',
    step: 2,
    title: '安装 Git',
    body: (
      <>
        <H3>2.1 确认电脑是 64 位</H3>
        <P>打开“设置” → “系统” → “关于”，看“系统类型”一栏：</P>
        <Ul>
          <li>
            显示 <b>64 位操作系统，基于 x64 的处理器</b> → 绝大多数电脑都是这种，继续往下
          </li>
          <li>
            显示 <b>基于 ARM 的处理器</b> → 下载时选择带 <C>arm64</C> 字样的文件
          </li>
        </Ul>
        <H3>2.2 下载安装包</H3>
        <OpenLink href="https://registry.npmmirror.com/binary.html?path=git-for-windows/" />
        <Ol>
          <li>
            页面上是一列文件夹，名字类似 <C>v2.51.0.windows.1/</C>。<b>找到版本号最大的那一个</b>
            （通常在列表最下面），点进去
          </li>
          <li>
            在文件列表中找到名字类似{' '}
            <b>
              <C>Git-2.51.0-64-bit.exe</C>
            </b>{' '}
            的文件（版本号可能不同，注意是 <C>64-bit.exe</C> 结尾，<b>不是</b> <C>portable</C> 也
            <b>不是</b> <C>.tar.bz2</C>），点击下载
          </li>
        </Ol>
        <Callout kind="warn">
          名字里带 <C>rc</C> 的文件夹（例如 <C>v2.56.0-rc2.windows.1/</C>
          ）是测试版，<b>不要选</b>，选不带 <C>rc</C> 的那一个。
        </Callout>
        <H3>2.3 安装</H3>
        <Ol>
          <li>
            双击下载好的 <C>Git-xxx-64-bit.exe</C>
          </li>
          <li>
            如果弹出“你要允许此应用对你的设备进行更改吗？”，点 <b>是</b>
          </li>
          <li>
            安装过程中会出现很多页英文选项，<b>全部保持默认，一直点 Next（下一步）</b>
          </li>
          <li>最后点 Install（安装），等进度条走完</li>
          <li>点 Finish（完成）</li>
        </Ol>
        <Callout>安装界面是英文的，看不懂没关系，全部默认就是正确的设置。</Callout>
      </>
    ),
  },
  {
    id: 'step-3',
    step: 3,
    title: '检查 Git 是否安装成功',
    body: (
      <>
        <Callout kind="warn">
          <b>先把之前打开的命令提示符窗口关掉，再按第 1 步重新打开一个新的。</b>
          （旧窗口不知道你刚装了新软件。）
        </Callout>
        <P>在新窗口里输入：</P>
        <Cmd>git --version</Cmd>
        <P>如果看到类似下面的文字（数字可能不同），就说明安装成功了：</P>
        <Out>git version 2.51.0.windows.1</Out>
        <P>再输入：</P>
        <Cmd>where git</Cmd>
        <Out label="应该能看到类似这样的路径">{'C:\\Program Files\\Git\\cmd\\git.exe'}</Out>
        <H3>如果显示“不是内部或外部命令”</H3>
        <Out label="出错时会看到">'git' 不是内部或外部命令，也不是可运行的程序或批处理文件。</Out>
        <P>说明系统没找到 Git，按顺序尝试：</P>
        <NotFoundFixes />
      </>
    ),
  },
  {
    id: 'step-4',
    step: 4,
    title: '安装 Node.js',
    body: (
      <>
        <H3>4.1 下载安装包</H3>
        <OpenLink href="https://registry.npmmirror.com/binary.html?path=node/" />
        <Ol>
          <li>
            页面上是一长串以 <C>v</C> 开头的文件夹。
            <b>
              找到 <C>v24.</C> 开头、数字最大的那一个
            </b>
            （例如 <C>v24.9.0/</C>），点进去
          </li>
          <li>
            在文件列表中找到名字类似{' '}
            <b>
              <C>node-v24.9.0-x64.msi</C>
            </b>{' '}
            的文件，点击下载。ARM 电脑选 <C>node-v24.x.x-arm64.msi</C>
          </li>
        </Ol>
        <Callout>
          为什么选 v24？双数版本（如 20、22、24）是“长期支持版”，最稳定。DyHub 要求至少 v20。
        </Callout>
        <P>
          也可以直接去官网 <C>https://nodejs.org/zh-cn/download</C> 下载 “LTS” 版本的 Windows
          安装包（.msi），效果一样，只是国内速度可能较慢。
        </P>
        <H3>4.2 安装</H3>
        <Ol>
          <li>
            双击下载好的 <C>node-xxx-x64.msi</C>
          </li>
          <li>
            一路点 Next，遇到许可协议时勾选 <C>I accept the terms in the License Agreement</C>
            （我接受协议）再点 Next
          </li>
          <li>
            中途有一页叫 <b>“Tools for Native Modules”</b>，上面有个复选框 —— <b>不要勾选它</b>
            ，直接点 Next
          </li>
          <li>
            点 Install，如果弹出“是否允许更改”，点 <b>是</b>
          </li>
          <li>点 Finish 完成</li>
        </Ol>
      </>
    ),
  },
  {
    id: 'step-5',
    step: 5,
    title: '检查 Node.js 是否安装成功',
    body: (
      <>
        <Callout kind="warn">
          <b>同样，先关掉命令提示符，再重新打开一个新的。</b>
        </Callout>
        <Cmd>node -v</Cmd>
        <Out label="应该看到类似">v24.9.0</Out>
        <P>再输入：</P>
        <Cmd>npm -v</Cmd>
        <Out label="应该看到类似">11.6.0</Out>
        <P>两个都显示版本号，说明 Node.js 和 npm 都装好了。</P>
        <P>如果显示“不是内部或外部命令”，处理方法和第 3 步一样：</P>
        <NotFoundFixes />
      </>
    ),
  },
  {
    id: 'step-6',
    step: 6,
    title: '安装 Google Chrome 浏览器',
    body: (
      <>
        <P>
          DyHub 需要借助 Google Chrome 浏览器来接收直播间弹幕。
          <b>如果你电脑上已经装了 Chrome，可以跳过这一步。</b>
        </P>
        <Callout kind="warn">Windows 自带的 Edge 浏览器不行，必须是 Google Chrome。</Callout>
        <OpenLink href="https://www.google.cn/chrome/" />
        <Ol>
          <li>点击“下载 Chrome”</li>
          <li>运行下载好的安装程序，等待自动安装完成</li>
        </Ol>
      </>
    ),
  },
  {
    id: 'step-7',
    step: 7,
    title: '下载 DyHub 程序',
    body: (
      <>
        <H3>7.1 选择存放位置</H3>
        <P>
          打开命令提示符后，默认所在的位置是 <C>{'C:\\Users\\你的用户名'}</C>
          。DyHub 会下载到这里，后面就在这个位置下操作即可。
        </P>
        <H3>7.2 下载</H3>
        <Cmd>{`git clone ${CLONE_URL}`}</Cmd>
        <Out label="会看到类似下面的进度，最后出现 done 即完成">
          {`Cloning into 'dy-hubs'...
remote: Enumerating objects: ...
Receiving objects: 100% ...
Resolving deltas: 100% ..., done.`}
        </Out>
        <P>
          下载完成后，你的用户文件夹里会多出一个名叫 <C>dy-hubs</C> 的文件夹。
        </P>
        <H3>7.3 进入程序文件夹</H3>
        <Cmd>cd dy-hubs</Cmd>
        <Out label="此时命令提示符开头会变成">{'C:\\Users\\你的用户名\\dy-hubs>'}</Out>
        <Callout kind="warn">
          后面所有命令都必须在这个 <C>dy-hubs</C> 文件夹里执行。如果你关掉了窗口，重新打开后要先输入{' '}
          <C>cd dy-hubs</C> 再继续。
        </Callout>
      </>
    ),
  },
  {
    id: 'step-8',
    step: 8,
    title: '安装依赖、构建、启动',
    body: (
      <>
        <H3>8.1 设置国内下载源（只需做一次）</H3>
        <P>npm 默认从国外服务器下载零部件，在国内很慢甚至会失败。先把它换成国内镜像：</P>
        <Cmd>npm config set registry https://registry.npmmirror.com</Cmd>
        <P>按回车，没有任何输出就是成功了。可以用下面的命令确认：</P>
        <Cmd>npm config get registry</Cmd>
        <Out label="应该显示">https://registry.npmmirror.com/</Out>
        <H3>8.2 设置命令运行环境（只需做一次）</H3>
        <P>
          DyHub 的构建步骤用到了一些 Windows 命令提示符不认识的命令，需要让 npm 借用 Git
          自带的运行环境。输入：
        </P>
        <Cmd>{'npm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"'}</Cmd>
        <P>按回车，没有输出就是成功了。</P>
        <Callout>
          如果你安装 Git 时改过安装位置，请把上面的路径换成你自己的 Git 安装目录下的{' '}
          <C>{'bin\\bash.exe'}</C>。
        </Callout>
        <H3>8.3 安装依赖</H3>
        <Cmd>npm install</Cmd>
        <P>
          等待 1～3 分钟。过程中出现 <C>npm warn</C>
          （黄色警告）可以忽略，最后看到类似这样的文字就是成功：
        </P>
        <Out>added 120 packages in 30s</Out>
        <Callout kind="bad">
          如果出现 <C>npm error</C>（红色），请看文末 <A href="#faq">常见问题</A>。
        </Callout>
        <H3>8.4 构建</H3>
        <Cmd>npm run build</Cmd>
        <P>
          等待十几秒，没有出现 <C>error</C> 字样就是成功了。
        </P>
        <H3>8.5 启动</H3>
        <Cmd>npm start</Cmd>
        <P>
          启动成功后会看到 DyHub 输出的启动信息，其中会提到端口 <C>8757</C>。
        </P>
        <P>
          如果弹出 <b>“Windows 安全中心警报 / Windows Defender 防火墙已阻止此应用的部分功能”</b>
          ，点击 <b>允许访问</b>。
        </P>
        <H3>8.6 打开控制台</H3>
        <OpenLink href="http://localhost:8757" />
        <P>看到 DyHub 控制台页面，就大功告成了 🎉</P>
        <Callout kind="warn">
          <b>使用期间不要关闭命令提示符窗口</b>，关掉窗口 DyHub 就停止运行了。
        </Callout>
      </>
    ),
  },
  {
    id: 'daily',
    title: '日常使用',
    body: (
      <>
        <H3>停止 DyHub</H3>
        <P>
          在运行 DyHub 的命令提示符窗口里按 <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd>
          。如果问你“终止批处理操作吗(Y/N)?”，输入 <C>Y</C> 再按回车。
        </P>
        <H3>下次再启动</H3>
        <P>以后不需要重复上面的安装步骤，只需要：</P>
        <Ol>
          <li>打开命令提示符（第 1 步）</li>
          <li>依次输入下面两条命令</li>
        </Ol>
        <Cmd>cd dy-hubs</Cmd>
        <Cmd>npm start</Cmd>
        <P>
          然后浏览器打开 <C>http://localhost:8757</C>。
        </P>
        <H3>更新到最新版本</H3>
        <P>
          当程序有更新时，先停止 DyHub，然后在 <C>dy-hubs</C> 文件夹里依次执行：
        </P>
        <Cmd>git pull</Cmd>
        <Cmd>npm install</Cmd>
        <Cmd>npm run build</Cmd>
        <Cmd>npm start</Cmd>
      </>
    ),
  },
  {
    id: 'faq',
    title: '常见问题',
    body: (
      <>
        <H3>输入命令后提示“不是内部或外部命令”</H3>
        <Ul>
          <li>关掉命令提示符重新打开（装完软件后必须重开）</li>
          <li>还不行就重启电脑</li>
          <li>
            确认 <A href="#step-3">第 3 步</A>、<A href="#step-5">第 5 步</A>的检查都通过了
          </li>
        </Ul>
        <H3>
          <C>git clone</C> 时弹出要求输入用户名和密码的窗口
        </H3>
        <P>说明这个程序仓库目前不是公开的，请联系提供程序的人获取访问权限。</P>
        <H3>
          <C>git clone</C> 提示 <C>already exists and is not an empty directory</C>
        </H3>
        <P>
          说明之前已经下载过了，不需要重新下载，直接输入 <C>cd dy-hubs</C> 继续后面的步骤即可。
        </P>
        <H3>
          <C>npm install</C> 很慢或报 <C>ETIMEDOUT</C> / <C>ECONNRESET</C> 等网络错误
        </H3>
        <Ul>
          <li>
            确认已经完成 <A href="#step-8">8.1 步</A>（设置国内下载源）
          </li>
          <li>
            网络不稳定时，重新执行一次 <C>npm install</C> 即可，它会接着下载
          </li>
        </Ul>
        <H3>
          <C>npm run build</C> 报错 <C>'rm' 不是内部或外部命令</C>
        </H3>
        <P>
          说明 <A href="#step-8">8.2 步</A>没有设置成功，请重新执行 8.2 步，并确认{' '}
          <C>{'C:\\Program Files\\Git\\bin\\bash.exe'}</C> 这个文件确实存在。
        </P>
        <H3>启动后提示找不到 Chrome</H3>
        <Ul>
          <li>
            确认已经完成 <A href="#step-6">第 6 步</A>，安装了 Google Chrome（不是 Edge）
          </li>
          <li>
            如果 Chrome 装在了非默认位置，先找到 <C>chrome.exe</C>{' '}
            的完整路径，然后依次输入下面两条命令（把路径换成你自己的）：
          </li>
        </Ul>
        <Cmd>
          {
            'set DYHUB_CHROME=C:\\Users\\你的用户名\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
          }
        </Cmd>
        <Cmd>npm start</Cmd>
        <H3>
          启动后提示端口 <C>8757</C> 被占用（<C>EADDRINUSE</C>）
        </H3>
        <P>
          说明 DyHub 已经在另一个窗口里运行了。找到那个窗口直接使用即可，或者先在那个窗口按{' '}
          <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd> 停掉再重新启动。
        </P>
      </>
    ),
  },
];

const s = stylex.create({
  h3: {
    fontSize: 18,
    marginBottom: space.md,
    marginTop: space.xxl,
  },
  p: {
    marginBlock: space.md,
  },
  a: {
    color: colors.accent,
    fontWeight: 600,
  },
  list: {
    gap: space.sm,
    marginBlock: space.md,
    display: 'flex',
    flexDirection: 'column',
    paddingInlineStart: space.xxl,
  },
});
