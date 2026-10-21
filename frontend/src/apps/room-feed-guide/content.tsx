import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { colors, space } from '@dy-apps/ui/tokens.stylex';
import roomId from './assets/room-id.png';
import { C, Callout, Cmd, Kbd, OpenLink, Out, Shot } from './ui/blocks';

export interface GuideSection {
  id: string;
  title: string;
  /** Numbered install steps get a number badge and a "done" toggle. */
  step?: number;
  body: ReactNode;
}

const CLONE_URL = 'https://github.com/miyabi2202/dy-apps.git';
/** Installs only what room-feed needs, not the rest of the repo's tools. */
const INSTALL = 'pnpm install --filter @dy-apps/room-feed --prod';
/** A made-up room number for the commands; readers put their own in its place. */
const EXAMPLE_ROOM = '484088206186';

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
            <b>Git</b>：一个下载代码的工具，我们用它把 room-feed 下载到你的电脑上。
          </li>
          <li>
            <b>Node.js</b>：运行 room-feed 所需要的软件环境，就像玩游戏需要先装运行库一样。
          </li>
          <li>
            <b>npm</b>：安装 Node.js 时会自动附带，这里只用它来安装 pnpm。
          </li>
          <li>
            <b>pnpm</b>：用来下载 room-feed 需要的零部件（叫“依赖”），以及启动 room-feed。
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
          <C>PS</C> 的窗口）。PowerShell 默认的安全设置会拦截后面要用的 <C>npm</C> 和 <C>pnpm</C>{' '}
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
          为什么选 v24？双数版本（如 22、24）是“长期支持版”，最稳定。room-feed 要求至少 v22。
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
          room-feed 需要借助 Google Chrome 浏览器来接收直播间弹幕。
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
    title: '下载 room-feed',
    body: (
      <>
        <H3>7.1 选择存放位置</H3>
        <P>
          打开命令提示符后，默认所在的位置是 <C>{'C:\\Users\\你的用户名'}</C>
          。room-feed 会下载到这里，后面就在这个位置下操作即可。
        </P>
        <H3>7.2 下载</H3>
        <Cmd>{`git clone --depth 1 ${CLONE_URL}`}</Cmd>
        <Out label="会看到类似下面的进度，最后出现 done 即完成">
          {`Cloning into 'dy-apps'...
remote: Enumerating objects: ...
Receiving objects: 100% ...
Resolving deltas: 100% ..., done.`}
        </Out>
        <P>
          下载完成后，你的用户文件夹里会多出一个名叫 <C>dy-apps</C> 的文件夹。room-feed
          和弹幕墙等小工具都在这个文件夹里。
        </P>
        <Callout>
          这一步从 GitHub 下载，国内有时会很慢或者中途失败。失败了就再执行一次同样的命令；如果提示{' '}
          <C>already exists</C>，见文末 <A href="#faq">常见问题</A>。
        </Callout>
        <H3>7.3 进入程序文件夹</H3>
        <Cmd>cd dy-apps</Cmd>
        <Out label="此时命令提示符开头会变成">{'C:\\Users\\你的用户名\\dy-apps>'}</Out>
        <Callout kind="warn">
          后面所有命令都必须在这个 <C>dy-apps</C> 文件夹里执行。如果你关掉了窗口，重新打开后要先输入{' '}
          <C>cd dy-apps</C> 再继续。
        </Callout>
      </>
    ),
  },
  {
    id: 'step-8',
    step: 8,
    title: '安装 pnpm 和依赖',
    body: (
      <>
        <H3>8.1 设置国内下载源（只需做一次）</H3>
        <P>npm 和 pnpm 默认从国外服务器下载零部件，在国内很慢甚至会失败。先把它换成国内镜像：</P>
        <Cmd>npm config set registry https://registry.npmmirror.com</Cmd>
        <P>按回车，没有任何输出就是成功了。可以用下面的命令确认：</P>
        <Cmd>npm config get registry</Cmd>
        <Out label="应该显示">https://registry.npmmirror.com/</Out>
        <H3>8.2 安装 pnpm（只需做一次）</H3>
        <Cmd>npm install -g pnpm</Cmd>
        <P>等十几秒，看到类似下面的文字就是装好了：</P>
        <Out>added 1 package in 5s</Out>
        <P>
          <b>关掉命令提示符，重新打开一个</b>，先 <C>cd dy-apps</C>，再输入：
        </P>
        <Cmd>pnpm -v</Cmd>
        <Out label="应该看到类似">11.9.0</Out>
        <P>如果显示“不是内部或外部命令”，处理方法和第 3 步一样：</P>
        <NotFoundFixes />
        <H3>8.3 安装依赖</H3>
        <Cmd>{INSTALL}</Cmd>
        <P>
          等待半分钟到几分钟。第一次运行时 pnpm
          可能会先下载它自己需要的版本，这是正常的。最后看到类似这样的文字就是成功：
        </P>
        <Out>Done in 32.5s using pnpm v11.9.0</Out>
        <Callout kind="bad">
          如果出现红色的 <C>ERR_PNPM</C> 或 <C>error</C>，请看文末 <A href="#faq">常见问题</A>。
        </Callout>
      </>
    ),
  },
  {
    id: 'step-9',
    step: 9,
    title: '登录抖音账号',
    body: (
      <>
        <Callout kind="warn">
          <b>不登录就收不到礼物消息！</b>
          没登录时只能看到弹幕和点赞，观众送的礼物一条都不会显示。所以这一步一定要做。
        </Callout>
        <P>
          在 <C>dy-apps</C> 文件夹里输入：
        </P>
        <Cmd>pnpm room-feed login</Cmd>
        <Ol>
          <li>会弹出一个打开了抖音网页的 Chrome 窗口。</li>
          <li>在这个窗口里登录你的抖音账号（扫码或手机验证码都可以）。</li>
          <li>登录成功后窗口会自动关闭，命令提示符里会显示：</li>
        </Ol>
        <Out>
          {
            '[room-feed] 登录成功，已保存到 C:\\Users\\你的用户名\\dy-apps\\room-feed\\data\\cookie.json'
          }
        </Out>
        <Callout>
          登录信息会自动保存，大约两个月有效，期间启动 room-feed
          不用重新登录。想换一个抖音账号，或者过期了，再运行一次 <C>pnpm room-feed login</C> 即可。
        </Callout>
      </>
    ),
  },
  {
    id: 'step-10',
    step: 10,
    title: '启动 room-feed，接收直播间',
    body: (
      <>
        <H3>10.1 找到房间号</H3>
        <P>
          用浏览器打开你要接收的抖音直播间，看地址栏：<C>live.douyin.com/</C> 后面的那一串数字就是
          <b>房间号</b>。
        </P>
        <Shot
          src={roomId}
          alt="浏览器地址栏 live.douyin.com/484088206186，红框标出了后面的数字"
          label="地址栏里的房间号"
        />
        <H3>10.2 启动</H3>
        <P>
          在 <C>dy-apps</C> 文件夹里输入下面的命令，<b>把最后的数字换成你的房间号</b>：
        </P>
        <Cmd>{`pnpm room-feed --room ${EXAMPLE_ROOM}`}</Cmd>
        <Callout>
          嫌只复制数字麻烦的话，把整个直播间链接放在 <C>--room</C> 后面也可以，room-feed
          会自己取出房间号。
        </Callout>
        <P>
          如果弹出 <b>“Windows 安全中心警报 / Windows Defender 防火墙已阻止此应用的部分功能”</b>
          ，点击 <b>允许访问</b>。
        </P>
        <P>启动后会看到类似这样的文字：</P>
        <Out>
          {`[room-feed] 已登录，有效期到 2026/12/5 12:10:15
[room-feed] 已启动：直播间 ${EXAMPLE_ROOM}，端口 8757
[room-feed] 事件流：ws://localhost:8757/ws?roomId=${EXAMPLE_ROOM}
[room-feed] 正在打开直播间 ${EXAMPLE_ROOM}…
[room-feed] 已连上直播间 ${EXAMPLE_ROOM} 的弹幕`}
        </Out>
        <P>
          <b>出现最后一行“已连上直播间……的弹幕”，就是连接成功了</b> 🎉
        </P>
        <Callout>
          直播间还没开播时，会看到“一直没收到弹幕推送（可能还没开播）”。不用管它，room-feed
          会每隔一会儿自己重新试，开播后就会连上。
        </Callout>
        <Callout kind="warn">
          <b>使用期间不要关闭命令提示符窗口</b>，关掉窗口 room-feed 就停止运行了。
        </Callout>
        <H3>10.3 在小工具里连接</H3>
        <P>
          打开弹幕墙等小工具，在“数据来源”里选 <b>直播间（room-feed）</b>，“端口”填 <C>8757</C>
          ，“直播间号”填<b>和上面同一个房间号</b>，再点 <b>连接</b>。
        </P>
        <Callout kind="warn">
          一个 room-feed 只接收一个直播间。小工具里填了别的房间号，会提示“这个 room-feed
          接收的是直播间……”：要么改成同一个房间号，要么按 <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd> 停掉
          room-feed，换房间号重新启动。
        </Callout>
      </>
    ),
  },
  {
    id: 'daily',
    title: '日常使用',
    body: (
      <>
        <H3>停止 room-feed</H3>
        <P>
          在运行 room-feed 的命令提示符窗口里按 <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd>
          。如果问你“终止批处理操作吗(Y/N)?”，输入 <C>Y</C> 再按回车。
        </P>
        <H3>下次再启动</H3>
        <P>以后不需要重复上面的安装步骤，只需要：</P>
        <Ol>
          <li>打开命令提示符（第 1 步）</li>
          <li>依次输入下面两条命令（房间号换成你的）</li>
        </Ol>
        <Cmd>cd dy-apps</Cmd>
        <Cmd>{`pnpm room-feed --room ${EXAMPLE_ROOM}`}</Cmd>
        <P>
          如果启动时提示“还没有登录”，说明登录过期了，先运行一次 <C>pnpm room-feed login</C>
          （第 9 步）。
        </P>
        <H3>更新到最新版本</H3>
        <P>
          当程序有更新时，先停止 room-feed，然后在 <C>dy-apps</C> 文件夹里依次执行：
        </P>
        <Cmd>git pull</Cmd>
        <Cmd>{INSTALL}</Cmd>
        <P>再照常启动即可。</P>
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
            确认 <A href="#step-3">第 3 步</A>、<A href="#step-5">第 5 步</A>、
            <A href="#step-8">8.2 步</A>的检查都通过了
          </li>
        </Ul>
        <H3>
          <C>git clone</C> 很慢、卡住不动，或者报 <C>Failed to connect</C> / <C>timed out</C>
        </H3>
        <P>
          GitHub 在国内有时不稳定。按 <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd> 停掉，过一会儿再执行一次{' '}
          <A href="#step-7">7.2 步</A>
          的命令。换个时间（比如早上）或者换个网络（比如手机热点）往往就好了。
        </P>
        <H3>
          <C>git clone</C> 提示 <C>already exists and is not an empty directory</C>
        </H3>
        <P>
          说明之前已经下载过了。如果上次是完整下载完的，直接输入 <C>cd dy-apps</C>{' '}
          继续后面的步骤即可；如果上次中途失败了，先删掉用户文件夹里的 <C>dy-apps</C>{' '}
          文件夹，再重新下载。
        </P>
        <H3>
          <C>pnpm install</C> 很慢或报 <C>ETIMEDOUT</C> / <C>ECONNRESET</C> 等网络错误
        </H3>
        <Ul>
          <li>
            确认已经完成 <A href="#step-8">8.1 步</A>（设置国内下载源）
          </li>
          <li>网络不稳定时，重新执行一次同样的命令即可，它会接着下载</li>
        </Ul>
        <H3>启动后提示找不到 Chrome</H3>
        <Ul>
          <li>
            确认已经完成 <A href="#step-6">第 6 步</A>，安装了 Google Chrome（不是 Edge）
          </li>
          <li>
            如果 Chrome 装在了非默认位置，先找到 <C>chrome.exe</C> 的完整路径，然后用{' '}
            <C>--chrome</C> 告诉 room-feed（把路径和房间号换成你自己的，路径两边的英文引号要留着）：
          </li>
        </Ul>
        <Cmd>
          {`pnpm room-feed --room ${EXAMPLE_ROOM} --chrome "D:\\Google\\Chrome\\Application\\chrome.exe"`}
        </Cmd>
        <P>
          登录时也一样：<C>pnpm room-feed login --chrome "chrome.exe 的路径"</C>。
        </P>
        <H3>能看到弹幕，却一直没有礼物消息</H3>
        <P>
          说明没有登录，或者登录过期了。看启动时第一行是不是“还没有登录”，是的话按{' '}
          <A href="#step-9">第 9 步</A>重新登录，再重新启动 room-feed。
        </P>
        <H3>
          启动后提示端口 <C>8757</C> 已被占用
        </H3>
        <P>
          说明 room-feed 已经在另一个窗口里运行了。找到那个窗口直接使用即可，或者先在那个窗口按{' '}
          <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd>{' '}
          停掉再重新启动。想同时接收两个直播间，就给第二个换一个端口， 比如在命令最后加上{' '}
          <C>--port 8758</C>，小工具里的端口也填 <C>8758</C>。
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
