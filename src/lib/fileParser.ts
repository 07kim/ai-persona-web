export async function parseFileToText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (['txt', 'md', 'csv', 'tsv'].includes(ext)) {
    return readAsText(file)
  }

  if (ext === 'json') {
    const text = await readAsText(file)
    try {
      const parsed = JSON.parse(text)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return text
    }
  }

  // フォールバック: テキストとして読み込む
  try {
    return readAsText(file)
  } catch {
    throw new Error(`このファイル形式（.${ext}）には対応していません。テキスト形式（.txt, .csv, .json, .md）を使用してください。`)
  }
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'))
    reader.readAsText(file, 'UTF-8')
  })
}

export function getSupportedExtensions(): string {
  return '.txt,.md,.csv,.tsv,.json'
}
