import type { Persona } from '../types'

// 職業キーワード→タグマッピング
const OCCUPATION_TAG_MAP: Array<[RegExp, string]> = [
  [/エンジニア|developer|プログラマー|SE|システム/i, 'エンジニア'],
  [/デザイナー|designer|クリエイター/i, 'デザイナー'],
  [/マーケター|マーケティング|marketing/i, 'マーケター'],
  [/PM|プロダクトマネージャー|プロジェクトマネージャー/i, 'PM'],
  [/営業|セールス|sales/i, '営業'],
  [/経営者|CEO|代表|社長|起業/i, '経営者'],
  [/コンサルタント|consultant/i, 'コンサル'],
  [/研究者|researcher|教授|准教授/i, '研究者'],
  [/医師|医者|看護師|薬剤師|医療/i, '医療'],
  [/教師|先生|講師|教育|学校/i, '教育'],
  [/学生|大学生|高校生|専門学校/i, '学生'],
  [/主婦|主夫|専業/i, '専業主婦/主夫'],
  [/フリーランス|自営業|個人事業/i, 'フリーランス'],
  [/クリエイター|YouTuber|インフルエンサー/i, 'クリエイター'],
  [/データ|アナリスト|analyst/i, 'データ分析'],
  [/人事|HR|採用/i, '人事'],
  [/経理|会計|財務/i, '財務'],
]

// 年齢→タグ
function ageTag(age: number): string {
  if (age < 20) return '10代'
  if (age < 30) return '20代'
  if (age < 40) return '30代'
  if (age < 50) return '40代'
  if (age < 60) return '50代'
  return '60代以上'
}

// 価値観キーワード→タグ
const VALUE_TAG_MAP: Array<[RegExp, string]> = [
  [/家族|子ども|育児|子育て/i, 'ファミリー重視'],
  [/キャリア|成長|スキル|学習/i, 'キャリア志向'],
  [/環境|サステナ|エコ|持続/i, '環境意識'],
  [/効率|生産性|タイパ|コスパ/i, '効率重視'],
  [/健康|フィットネス|ウェルネス/i, '健康意識'],
  [/社会|貢献|ボランティア/i, '社会貢献'],
  [/趣味|娯楽|エンタメ/i, '趣味重視'],
  [/節約|倹約|コスト/i, '節約志向'],
  [/革新|イノベーション|新しい/i, '革新志向'],
]

// 趣味・日課キーワード→タグ
const HOBBY_TAG_MAP: Array<[RegExp, string]> = [
  [/ゲーム|gaming/i, 'ゲーマー'],
  [/アニメ|漫画|コミック/i, 'オタク'],
  [/料理|グルメ|食/i, 'グルメ'],
  [/旅行|トラベル/i, '旅行好き'],
  [/スポーツ|ランニング|筋トレ|ジム/i, 'スポーツ'],
  [/読書|本|ビジネス書/i, '読書家'],
  [/音楽|ライブ/i, '音楽'],
  [/写真|カメラ/i, '写真'],
  [/アウトドア|キャンプ|登山/i, 'アウトドア'],
]

export function generateAutoTags(persona: Partial<Persona>): string[] {
  const tags = new Set<string>()

  // 年齢タグ
  if (persona.age) tags.add(ageTag(persona.age))

  // 性別タグ
  if (persona.gender === 'male') tags.add('男性')
  else if (persona.gender === 'female') tags.add('女性')

  // 居住地タグ
  if (persona.city) {
    const city = persona.city
    if (/東京|新宿|渋谷|品川|港区|中央|千代田|世田谷|杉並/.test(city)) tags.add('東京')
    else if (/大阪|梅田|難波/.test(city)) tags.add('大阪')
    else if (/名古屋/.test(city)) tags.add('名古屋')
    else if (/福岡|博多/.test(city)) tags.add('福岡')
    else if (/北海道|札幌/.test(city)) tags.add('北海道')
    else tags.add('地方')
  }

  // 職業タグ
  if (persona.occupation) {
    for (const [pattern, tag] of OCCUPATION_TAG_MAP) {
      if (pattern.test(persona.occupation)) {
        tags.add(tag)
        break
      }
    }
  }

  // 価値観タグ
  const allValues = (persona.values ?? []).join(' ')
  for (const [pattern, tag] of VALUE_TAG_MAP) {
    if (pattern.test(allValues)) tags.add(tag)
  }

  // 課題タグ
  const painText = (persona.pain_points ?? []).join(' ')
  if (/時間がない|忙しい|多忙/.test(painText)) tags.add('時間不足')
  if (/お金|費用|コスト|高い/.test(painText)) tags.add('コスト意識')

  // 趣味タグ
  const hobbyText = (persona.hobbies ?? []).join(' ')
  for (const [pattern, tag] of HOBBY_TAG_MAP) {
    if (pattern.test(hobbyText)) tags.add(tag)
  }

  // 家族タグ
  if (persona.family) {
    if (/既婚|配偶者|夫|妻/.test(persona.family)) tags.add('既婚')
    if (/子ども|こども|息子|娘|子供/.test(persona.family)) tags.add('子育て中')
    if (/未婚|独身/.test(persona.family)) tags.add('独身')
  }

  // スマホ・アプリ傾向
  const apps = (persona.apps_used ?? []).join(' ')
  if (/Instagram|TikTok|Twitter|X|SNS/.test(apps)) tags.add('SNS活用')
  if (/Slack|Notion|Teams|Zoom/.test(apps)) tags.add('ビジネスツール')

  return Array.from(tags)
}
