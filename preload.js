const path = require('path')
const fs = require('fs')
const cp = require('child_process')
let bookmarksDataCache = null

function getBookmarks (dataDir, browser) {
  const profiles = ['Default', 'Profile 3', 'Profile 2', 'Profile 1']
  const profile = profiles.find(profile => fs.existsSync(path.join(dataDir, profile, 'Bookmarks')))
  if (!profile) return []
  const bookmarkPath = path.join(dataDir, profile, 'Bookmarks')
  const bookmarksData = []
  const icon = browser + '.png'
  try {
    const data = JSON.parse(fs.readFileSync(bookmarkPath, 'utf-8'))
    const getUrlData = (item, folder) => {
      if (!item || !Array.isArray(item.children)) return
      item.children.forEach(c => {
        if (c.type === 'url') {
          bookmarksData.push({
            addAt: parseInt(c.date_added),
            title: c.name || '',
            description: (folder ? '「' + folder + '」' : '') + c.url,
            url: c.url,
            browser,
            icon
          })
        } else if (c.type === 'folder') {
          getUrlData(c, folder ? folder + ' - ' + c.name : c.name)
        }
      })
    }
    getUrlData(data.roots.bookmark_bar, '')
    getUrlData(data.roots.other, '')
    getUrlData(data.roots.synced, '')
  } catch (e) {}
  return bookmarksData
}

function openUrlByChrome (url) {
  const openChrome = (chromePath) => {
    if (chromePath && fs.existsSync(chromePath)) {
      cp.spawn(chromePath, [url], { detached: true });
    } else {
      window.utools.shellOpenExternal(url);
    }
  };

  if (process.platform === 'win32') {
    const suffix = `${path.sep}Google${path.sep}Chrome${path.sep}Application${path.sep}chrome.exe`;
    const prefixes = [process.env['PROGRAMFILES(X86)'], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter(Boolean);
    const chromePath = prefixes.map(prefix => path.join(prefix, suffix)).find(p => fs.existsSync(p));
    openChrome(chromePath);
  } else if (process.platform === 'darwin') {
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    openChrome(chromePath);
  } else if (process.platform === 'linux') {
    const chromePath = '/usr/bin/google-chrome';
    openChrome(chromePath);
  } else {
    window.utools.shellOpenExternal(url);
  }
}

function openUrlByEdge (url) {
  const openEdge = (edgePath) => {
    if (edgePath && fs.existsSync(edgePath)) {
      cp.spawn(edgePath, [url], { detached: true });
    } else {
      window.utools.shellOpenExternal(url);
    }
  };

  if (process.platform === 'win32') {
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    openEdge(edgePath);
  } else if (process.platform === 'darwin') {
    const edgePath = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    openEdge(edgePath);
  } else if (process.platform === 'linux') {
    const edgePath = '/usr/bin/microsoft-edge';
    openEdge(edgePath);
  } else {
    window.utools.shellOpenExternal(url);
  }
}

/**
 * 排序匹配列表
 * 优先级：
 * 1. title完全匹配
 * 2. description完全匹配
 * 3. title包含匹配
 * 4. description包含匹配
 * 支持多个搜索词，用空格分隔，第一个词必须匹配了，才去匹配第二个词
 */
function sortMatchList(list, searchWords) {
  const searchRegexes = searchWords.split(/\s+/).map(word => new RegExp(word, 'i'));

  // 创建评分函数
  const getMatchScore = (item) => {
    let score = 0;
    let matched = true;

    for (let i = 0; i < searchRegexes.length; i++) {
      const regex = searchRegexes[i];
      if (matched) {
        if (item.title === searchWords) return 8; // title 完全匹配优先级最高
        if (item.description === searchWords) return 7; // description 完全匹配次高
        if (regex.test(item.title)) {
          score += 2;
        } else if (regex.test(item.description)) {
          score += 1;
        } else {
          matched = false;
          score = 0;
        }
      } else {
        break;
      }
    }
    return score;
  };

  // 给每个项分配分数
  const scoredList = list.map(item => ({
    ...item,
    score: getMatchScore(item)
  }));

  // 过滤掉分数为0的项，并按分数降序排序
  const filteredSortedList = scoredList
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // 移除分数属性并返回过滤和排序后的列表
  return filteredSortedList.map(({ score, ...rest }) => rest);
}

window.exports = {
  'bookmarks-search': {
    mode: 'list',
    args: {
      enter: (action, callbackSetList) => {
        bookmarksDataCache = []
        let chromeDataDir
        let edgeDataDir
        if (process.platform === 'win32') {
          chromeDataDir = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data')
          edgeDataDir = path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/User Data')
        } else if (process.platform === 'darwin') {
          chromeDataDir = path.join(window.utools.getPath('appData'), 'Google/Chrome')
          edgeDataDir = path.join(window.utools.getPath('appData'), 'Microsoft Edge')
        } else { return }
        if (fs.existsSync(chromeDataDir)) {
          bookmarksDataCache.push(...getBookmarks(chromeDataDir, 'chrome'))
        }
        if (fs.existsSync(edgeDataDir)) {
          bookmarksDataCache.push(...getBookmarks(edgeDataDir, 'edge'))
        }
        if (bookmarksDataCache.length > 0) {
          bookmarksDataCache = bookmarksDataCache.sort((a, b) => a.addAt - b.addAt)
        }
      },
      search: (action, searchWord, callbackSetList) => {
        searchWord = searchWord.trim()
        if (!searchWord) 
          return callbackSetList()

        return callbackSetList(sortMatchList(bookmarksDataCache, searchWord))
      },
      select: (action, itemData) => {
        window.utools.hideMainWindow(false)
        if (itemData.browser === 'chrome') {
          openUrlByChrome(itemData.url)
        } else {
          openUrlByEdge(itemData.url)
        }
        window.utools.outPlugin()
      }
    }
  }
}
