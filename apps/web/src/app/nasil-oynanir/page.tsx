import {
  DEFAULT_LOCALE,
  DEFAULT_TARGET_SCORE,
  HAND_SIZE,
  JUDGING_DURATION_MS,
  MAX_PLAYERS_PER_ROOM,
  MIN_PLAYERS_TO_START,
  MIN_SUBMISSIONS_TO_JUDGE,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  RECONNECT_GRACE_PERIOD_MS,
  ROOM_CODE_LENGTH,
  ROUND_RESULT_DURATION_MS,
  SELECTING_DURATION_MS,
  translate,
} from '@bozukkart/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { JsonLd } from '@/components/json-ld';
import { ogLocale } from '@/lib/site';

/*
 * Turkish only, so the copy lives here rather than in the shared dictionary,
 * which holds the UI strings every locale has to carry.
 *
 * Every rule on this page is one the room server enforces
 * (apps/api/src/rooms/rooms.service.ts), and every number comes from the same
 * constants it reads, so a limit changed there changes here too. Numbers never
 * take a suffix in this copy: Turkish suffixes follow the number's sound, and a
 * changed constant would leave the old one behind.
 */

const seconds = (ms: number): number => ms / 1000;

const HEADING = 'Bozukkart nasıl oynanır?';

const DESCRIPTION = `Bozukkart kuralları: oda kur, kodu paylaş, sırayla jüri ol, ${DEFAULT_TARGET_SCORE} puana ilk ulaşan kazanır. ${MIN_PLAYERS_TO_START} ila ${MAX_PLAYERS_PER_ROOM} kişiyle, kayıt olmadan tarayıcıda oynanır.`;

const INTRO =
  'Bozukkart, muhakemesi zayıf insanlar için boşluk doldurma oyunu. Her elde biri jüri olur, diğerleri ellerindeki kartlarla bir cümledeki boşluğu doldurur, jüri de en beğendiğini seçer. Kurallar kısa; zor olan, arkadaşlarının neye güleceğini tahmin etmek.';

const RULES: readonly string[] = [
  `Ana sayfada takma adını yaz (${NICKNAME_MIN_LENGTH} ile ${NICKNAME_MAX_LENGTH} karakter arası) ve “Oda aç” düğmesine bas. Odayı açan kurucu olur; oyunu başlatmak ve bot eklemek onun işi.`,
  `Ekrandaki ${ROOM_CODE_LENGTH} harfli oda kodunu ya da davet bağlantısını arkadaşlarına gönder. Kodu sesli okuyacaksan için rahat olsun: I ve O harfleri, 1 ve 0 ile karışmasın diye hiç kullanılmıyor.`,
  'Arkadaşların ana sayfada takma adlarını ve kodu yazıp “Katıl” düğmesine basar ya da davet bağlantısını açıp takma adlarını yazarak doğrudan odaya girer. Aynı odada iki kişi aynı takma adı kullanamaz.',
  `Masaya en az ${MIN_PLAYERS_TO_START}, en fazla ${MAX_PLAYERS_PER_ROOM} kişi oturur. ${MIN_PLAYERS_TO_START} kişi toplayamadıysan kurucu, oyun başlamadan önce masaya bot ekleyebilir. Botlar kartlarını rastgele oynar ve sırası gelince jüri olur. Dürüst olalım, çoğu insandan pek farkları yok.`,
  'Herkes hazırsa kurucu “Oyunu başlat” düğmesine basar.',
  'Her elde bir kişi jüridir ve o el kart oynamaz. İlk jüri odaya ilk giren oyuncudur; sonraki her elde jürilik, katılma sırasına göre bir sonraki oyuncuya geçer.',
  `Ekrana boşluklu bir soru kartı gelir. Jüri dışındaki herkesin elinde ${HAND_SIZE} cevap kartı vardır ve oynadığın kartların yerine yenileri gelir. Boşluğa en çok yakışanı ya da hiç yakışmaması gerekeni seç. İki boşluklu sorularda iki kart seçersin; seçme sıran, cümledeki sıra olur.`,
  `Kart seçmek için ${seconds(SELECTING_DURATION_MS)} saniyen var. Herkes oynayınca beklemeden jüriye geçilir. Süre dolduğunda oynamayan o eli kaçırır; masada ${MIN_SUBMISSIONS_TO_JUDGE} kart bile yoksa el iptal olur ve yeni el dağıtılır.`,
  `Kartlar karıştırılıp jüriye isimsiz gösterilir. Jüri ${seconds(JUDGING_DURATION_MS)} saniye içinde kazananı seçer; seçmezse kazanan rastgele belirlenir.`,
  `Seçilen kartın sahibi 1 puan alır ve kimin ne oynadığı ortaya çıkar. ${seconds(ROUND_RESULT_DURATION_MS)} saniye sonra sonraki el kendiliğinden dağıtılır.`,
  `${DEFAULT_TARGET_SCORE} puana ilk ulaşan oyunu kazanır. Kurucu “Yeniden oyna” düğmesine basarsa puanlar sıfırlanır ve rezillik baştan başlar.`,
  `Bağlantın koparsa yerin, kartların ve puanın ${seconds(RECONNECT_GRACE_PERIOD_MS)} saniye boyunca tutulur. Masada bağlı ${MIN_PLAYERS_TO_START} kişi bile kalmazsa oyun duraklar ve puanlar yerinde kalır. Kurucu çıkarsa kuruculuk başka bir oyuncuya geçer; herkes çıkınca oda kapanır.`,
];

interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

/** Rendered on the page and in the FAQPage data from this one list, so the two match word for word. */
const FAQ: readonly FaqEntry[] = [
  {
    question: 'Bozukkart kaç kişiyle oynanır?',
    answer: `En az ${MIN_PLAYERS_TO_START}, en fazla ${MAX_PLAYERS_PER_ROOM} kişiyle. Yeterli kişi yoksa kurucu masaya bot ekleyebilir; botlar da sayıya dahil.`,
  },
  {
    question: 'Ücretsiz mi?',
    answer: 'Evet, tamamen ücretsiz. Ödeme ya da abonelik yok.',
  },
  {
    question: 'Kayıt olmak gerekiyor mu?',
    answer: 'Hayır. Hesap yok, kayıt yok. Bir takma ad yazman yeterli.',
  },
  {
    question: 'Telefondan oynanır mı?',
    answer:
      'Evet. Oyun tarayıcıda çalışır, uygulama indirmen gerekmez. Herkes kendi telefonundan ya da bilgisayarından katılır.',
  },
  {
    question: "Cards Against Humanity'ye benziyor mu?",
    answer:
      'Evet, aynı türden bir parti oyunu: boşluklu bir soru kartı, onu dolduran cevap kartları ve kazananı seçen bir jüri. Bozukkart tarayıcıda, Türkçe kartlarla oynanır ve o oyunla resmi bir bağı yoktur.',
  },
  {
    question: 'Oda nasıl kurulur?',
    answer: `Ana sayfada takma adını yaz ve “Oda aç” düğmesine bas. Çıkan ${ROOM_CODE_LENGTH} harfli kodu ya da davet bağlantısını arkadaşlarına gönder, gerisini onların muhakemesine bırak.`,
  },
];

const FAQ_PAGE = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: answer,
    },
  })),
};

export const metadata: Metadata = {
  // The layout's template adds the site name after it.
  title: 'Nasıl oynanır',
  description: DESCRIPTION,
  // Set here or the layout's canonical, which names the homepage, is inherited.
  alternates: {
    canonical: '/nasil-oynanir',
  },
  // Next replaces the layout's `openGraph` rather than merging into it, so the
  // site-wide fields are repeated here or they are simply lost.
  openGraph: {
    type: 'website',
    siteName: translate(DEFAULT_LOCALE, 'app.name'),
    locale: ogLocale(DEFAULT_LOCALE),
    url: '/nasil-oynanir',
    title: HEADING,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: HEADING,
    description: DESCRIPTION,
  },
};

export default function HowToPlayPage() {
  return (
    <>
      <JsonLd data={FAQ_PAGE} />
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-6">
        <Link
          href="/"
          className="self-start font-display text-2xl uppercase leading-none tracking-tight"
        >
          {translate(DEFAULT_LOCALE, 'app.name')}
          <span className="text-blood">.</span>
        </Link>

        <header className="space-y-4">
          <h1 className="font-display text-4xl uppercase leading-none tracking-tight sm:text-5xl">
            {HEADING}
          </h1>
          <p className="text-sm leading-relaxed text-bone-dim">{INTRO}</p>
        </header>

        <section aria-labelledby="kurallar" className="panel">
          <h2
            id="kurallar"
            className="font-display text-xl uppercase leading-none tracking-wide"
          >
            Kurallar
          </h2>
          <ol className="mt-4 space-y-2">
            {RULES.map((rule, index) => (
              <li
                key={rule}
                className="flex gap-3 rounded-lg border border-felt-raised bg-ink-deep px-3 py-2.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-chip border border-ash font-display text-xs text-nicotine">
                  {index + 1}
                </span>
                <p className="min-w-0 text-sm leading-relaxed">{rule}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="sss" className="panel">
          <h2
            id="sss"
            className="font-display text-xl uppercase leading-none tracking-wide"
          >
            Sık sorulan sorular
          </h2>
          <div className="mt-4 divide-y divide-felt-raised">
            {FAQ.map(({ question, answer }) => (
              <div key={question} className="py-3 first:pt-0 last:pb-0">
                <h3 className="font-semibold text-bone">{question}</h3>
                <p className="mt-1 text-sm leading-relaxed text-bone-dim">
                  {answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        <Link href="/" className="btn btn--primary w-full text-base">
          Anladım, bir oda açayım
        </Link>
      </main>
    </>
  );
}
