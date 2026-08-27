import type { Locale } from './constants';

/**
 * Every string a human ever reads lives here. The server never sends prose: it
 * sends a key plus params and the client renders it in whatever locale it is
 * showing, which is the only way a room can be Turkish while an error raised on
 * the server still reads correctly.
 */
const EN = {
  'app.name': 'Bozukkart',
  'app.tagline':
    'A fill-in-the-blank party game for people with poor judgement. Start a room, share the code, wait for your friends to embarrass themselves.',
  'app.description': 'A fill-in-the-blank party game for people with poor judgement.',
  'meta.roomTitle': 'Room {code} - Bozukkart',
  'meta.imageAlt': 'Bozukkart',
  'meta.roomOgTitle': "You're invited to room {code}",
  'meta.roomOgDescription':
    'A Bozukkart table is set and one seat is yours. Open the link, pick a nickname, play your worst card.',
  'meta.roomImageAlt': 'A Bozukkart room invite with the room code on a card',
  'meta.ogInvite': 'Open the link, pick a nickname, take a seat.',

  'locale.label': 'Language',
  'locale.tr': 'Türkçe',
  'locale.en': 'English',

  'connection.connected': 'Connected',
  'connection.connecting': 'Connecting...',

  'landing.nicknameLabel': 'Your nickname',
  'landing.nicknamePlaceholder': 'Dave',
  'landing.createRoom': 'Create a room',
  'landing.creating': 'Creating room...',
  'landing.or': 'or',
  'landing.codeLabel': 'Room code',
  'landing.codePlaceholder': 'CODE',
  'landing.join': 'Join',
  'landing.joining': 'Joining...',
  'landing.footer': 'No accounts, no database. Rooms disappear when everyone leaves.',

  'lobby.roomCode': 'Room code',
  'lobby.copy': 'Copy',
  'lobby.share': 'Share',
  'lobby.copied': 'Copied',
  'lobby.copyLinkLabel': 'Copy the invite link',
  'lobby.shareLinkLabel': 'Share the invite link',
  'lobby.linkCopied': 'Invite link copied. Paste it wherever your friends are.',
  'lobby.copyFailed': 'Could not copy. Read the code out loud instead.',
  'lobby.shareHint':
    'Send the link and whoever opens it walks straight in. Reading the code out works too.',
  'lobby.players': 'Players',
  'lobby.you': 'You',
  'lobby.host': 'Host',
  'lobby.judge': 'Judge',
  'lobby.reconnecting': 'Reconnecting',
  'lobby.leaveRoom': 'Leave room',
  'lobby.joiningRoom': 'Joining room',
  'lobby.joinRoom': 'Join room',
  'lobby.backToStart': 'Back to the start',
  'lobby.alreadyInRoom':
    'You are already in room {current}. Leave it before joining {target}.',
  'lobby.backToRoom': 'Back to {code}',
  'lobby.leaveThatRoom': 'Leave {code}',
  'lobby.gettingYouBack': 'Getting you back into',
  'lobby.reconnectingStatus': 'Reconnecting...',
  'lobby.seatHeldHint':
    'Your seat, your nickname and the host badge are held for a moment after a drop.',

  'game.startGame': 'Start game',
  'game.starting': 'Starting...',
  'game.needMorePlayers': 'You need at least {min} players to start.',
  'game.waitingForHostToStart': 'Waiting on the host to start the game.',
  'game.round': 'Round {number}',
  'game.targetScore': 'First to {score} wins',
  'game.judgeIs': '{nickname} is judging this round',
  'game.youAreJudge': 'You are the judge this round',
  'game.pickOne': 'Pick a card',
  'game.pickMany': 'Pick {count} cards, in order',
  'game.submit': 'Submit',
  'game.submitting': 'Submitting...',
  'game.yourHand': 'Your hand',
  'game.yourSubmission': 'You played',
  'game.submitted': 'Played. Waiting for the others.',
  'game.judgeWaiting': 'Waiting for everyone to play.',
  'game.waitingOn': 'Still playing: {players}',
  'game.submissions': 'The plays',
  'game.judgePickWinner': 'Pick the one that wins the round.',
  'game.waitingForJudge': 'Waiting on the judge to pick a winner.',
  'game.pickWinner': 'This one wins',
  'game.picking': 'Picking...',
  'game.roundWinner': '{nickname} wins the round',
  'game.playedBy': 'Played by {nickname}',
  'game.nextRound': 'Next round',
  'game.advancing': 'Dealing...',
  'game.waitingForHostNextRound': 'Waiting on the host to deal the next round.',
  'game.nextRoundSoon': 'The next round deals itself in a moment.',
  'game.gameOver': 'Game over',
  'game.gameWinner': '{nickname} wins the game',
  'game.playAgain': 'Play again',
  'game.paused': 'Game paused',
  'game.pausedHint':
    'The game needs {min} connected players. It picks up where it left off once enough people are back.',
  'game.resume': 'Deal the next round',
  'game.score': '{score}',
  'game.scoreboard': 'Scores',
  'game.emptyHand': 'No cards yet. They arrive when the next round is dealt.',
  'game.timeLeft': '{seconds} seconds left',
  'game.timeUp': 'Time up',

  'errors.invalidPayload': 'That request did not look right.',
  'errors.roomNotFound': 'There is no room with code {code}.',
  'errors.roomFull': 'That room is full ({max} players max).',
  'errors.nicknameTaken': 'Someone in that room is already using that nickname.',
  'errors.alreadyInRoom': 'You are already in room {code}. Leave it first.',
  'errors.notInRoom': 'You are not in a room.',
  'errors.roomCodeUnavailable':
    'Could not allocate a room code. Try again in a moment.',
  'errors.internal': 'Something went wrong. Please try again.',
  'errors.notConnected': 'Not connected to the server yet.',
  'errors.timeout': 'The server did not answer. Is the API running on port 3001?',
  'errors.nicknameTooShort': 'Nickname must be at least {min} characters.',
  'errors.nicknameTooLong': 'Nickname must be at most {max} characters.',
  'errors.invalidRoomCode': 'Room code must be {length} letters (I and O are never used).',
  'errors.invalidPlayerId': 'Player id must be a UUID.',
  'errors.invalidLocale': 'Pick a supported language.',
  'errors.invalidTargetScore': 'Target score must be between {min} and {max}.',
  'errors.invalidCardId': 'That card id is not valid.',
  'errors.invalidSubmissionId': 'That play id is not valid.',
  'errors.notHost': 'Only the host can do that.',
  'errors.notJudge': "Only this round's judge can do that.",
  'errors.judgeCannotSubmit': 'The judge does not play a card this round.',
  'errors.wrongPhase': 'You cannot do that right now.',
  'errors.alreadySubmitted': 'You have already played this round.',
  'errors.cardNotInHand': 'That card is not in your hand.',
  'errors.wrongPickCount': 'This prompt takes exactly {pick} card(s).',
  'errors.duplicateCards': 'You cannot play the same card twice.',
  'errors.submissionNotFound': 'That play is no longer on the table.',
  'errors.notEnoughPlayers': 'You need at least {min} connected players.',
  'errors.noRoundInProgress': 'There is no round in progress.',
} as const;

export type MessageKey = keyof typeof EN;

const TR: Record<MessageKey, string> = {
  'app.name': 'Bozukkart',
  'app.tagline':
    'Muhakemesi zayıf insanlar için boşluk doldurma oyunu. Bir oda aç, kodu paylaş, arkadaşlarının kendini rezil etmesini bekle.',
  'app.description': 'Muhakemesi zayıf insanlar için boşluk doldurma oyunu.',
  'meta.roomTitle': '{code} odası - Bozukkart',
  'meta.imageAlt': 'Bozukkart',
  'meta.roomOgTitle': '{code} odasına davetlisin',
  'meta.roomOgDescription':
    'Bozukkart masası kuruldu, bir sandalye senin. Bağlantıyı aç, takma adını yaz, en bozuk kartını oyna.',
  'meta.roomImageAlt': 'Kart üstünde oda kodu yazan Bozukkart davetiyesi',
  'meta.ogInvite': 'Bağlantıyı aç, takma adını yaz, masaya otur.',

  'locale.label': 'Dil',
  'locale.tr': 'Türkçe',
  'locale.en': 'English',

  'connection.connected': 'Bağlandı',
  'connection.connecting': 'Bağlanıyor...',

  'landing.nicknameLabel': 'Takma adın',
  'landing.nicknamePlaceholder': 'Ayşe',
  'landing.createRoom': 'Oda aç',
  'landing.creating': 'Oda açılıyor...',
  'landing.or': 'ya da',
  'landing.codeLabel': 'Oda kodu',
  'landing.codePlaceholder': 'KOD',
  'landing.join': 'Katıl',
  'landing.joining': 'Katılınıyor...',
  'landing.footer': 'Hesap yok, veritabanı yok. Herkes çıkınca oda kaybolur.',

  'lobby.roomCode': 'Oda kodu',
  'lobby.copy': 'Kopyala',
  'lobby.share': 'Paylaş',
  'lobby.copied': 'Kopyalandı',
  'lobby.copyLinkLabel': 'Davet bağlantısını kopyala',
  'lobby.shareLinkLabel': 'Davet bağlantısını paylaş',
  'lobby.linkCopied': 'Davet bağlantısı kopyalandı. Nereye yapıştıracağın sana kalmış.',
  'lobby.copyFailed': 'Kopyalanamadı. Kodu sesli okuyuver.',
  'lobby.shareHint':
    'Bağlantıyı gönder, açan doğrudan masaya oturur. Kodu okusan da olur.',
  'lobby.players': 'Oyuncular',
  'lobby.you': 'Sen',
  'lobby.host': 'Kurucu',
  'lobby.judge': 'Jüri',
  'lobby.reconnecting': 'Bağlanıyor',
  'lobby.leaveRoom': 'Odadan çık',
  'lobby.joiningRoom': 'Odaya katılınıyor',
  'lobby.joinRoom': 'Odaya katıl',
  'lobby.backToStart': 'Başa dön',
  'lobby.alreadyInRoom':
    'Zaten {current} odasındasın. {target} odasına katılmadan önce oradan çık.',
  'lobby.backToRoom': '{code} odasına dön',
  'lobby.leaveThatRoom': '{code} odasından çık',
  'lobby.gettingYouBack': 'Seni geri sokuyoruz:',
  'lobby.reconnectingStatus': 'Yeniden bağlanılıyor...',
  'lobby.seatHeldHint':
    'Bağlantın koptuğunda yerin, takma adın ve kurucu rozetin kısa bir süre tutulur.',

  'game.startGame': 'Oyunu başlat',
  'game.starting': 'Başlıyor...',
  'game.needMorePlayers': 'Başlamak için en az {min} oyuncu gerekiyor.',
  'game.waitingForHostToStart': 'Kurucunun oyunu başlatması bekleniyor.',
  'game.round': '{number}. el',
  'game.targetScore': '{score} puana ulaşan kazanır',
  'game.judgeIs': 'Bu elin jürisi {nickname}',
  'game.youAreJudge': 'Bu elde jüri sensin',
  'game.pickOne': 'Bir kart seç',
  'game.pickMany': 'Sırasıyla {count} kart seç',
  'game.submit': 'Gönder',
  'game.submitting': 'Gönderiliyor...',
  'game.yourHand': 'Elindekiler',
  'game.yourSubmission': 'Oynadığın',
  'game.submitted': 'Oynadın. Diğerleri bekleniyor.',
  'game.judgeWaiting': 'Herkesin oynaması bekleniyor.',
  'game.waitingOn': 'Hâlâ oynayanlar: {players}',
  'game.submissions': 'Oynananlar',
  'game.judgePickWinner': 'Eli kazananı seç.',
  'game.waitingForJudge': 'Jürinin kazananı seçmesi bekleniyor.',
  'game.pickWinner': 'Bu kazansın',
  'game.picking': 'Seçiliyor...',
  'game.roundWinner': 'Eli {nickname} kazandı',
  'game.playedBy': 'Oynayan: {nickname}',
  'game.nextRound': 'Sonraki el',
  'game.advancing': 'Dağıtılıyor...',
  'game.waitingForHostNextRound': 'Kurucunun sonraki eli dağıtması bekleniyor.',
  'game.nextRoundSoon': 'Sonraki el birazdan kendiliğinden dağıtılacak.',
  'game.gameOver': 'Oyun bitti',
  'game.gameWinner': 'Oyunu {nickname} kazandı',
  'game.playAgain': 'Yeniden oyna',
  'game.paused': 'Oyun duraklatıldı',
  'game.pausedHint':
    'Oyun için {min} bağlı oyuncu gerekiyor. Yeterli kişi dönünce kaldığı yerden devam eder.',
  'game.resume': 'Sonraki eli dağıt',
  'game.score': '{score}',
  'game.scoreboard': 'Puanlar',
  'game.emptyHand': 'Henüz kart yok. Sonraki el dağıtılınca gelirler.',
  'game.timeLeft': '{seconds} saniye kaldı',
  'game.timeUp': 'Süre doldu',

  'errors.invalidPayload': 'Bu istek doğru görünmüyor.',
  'errors.roomNotFound': '{code} kodlu bir oda yok.',
  'errors.roomFull': 'O oda dolu (en fazla {max} oyuncu).',
  'errors.nicknameTaken': 'O odada bu takma adı kullanan biri var.',
  'errors.alreadyInRoom': 'Zaten {code} odasındasın. Önce oradan çık.',
  'errors.notInRoom': 'Bir odada değilsin.',
  'errors.roomCodeUnavailable': 'Oda kodu üretilemedi. Birazdan tekrar dene.',
  'errors.internal': 'Bir şeyler ters gitti. Lütfen tekrar dene.',
  'errors.notConnected': 'Sunucuya henüz bağlanılmadı.',
  'errors.timeout': 'Sunucu cevap vermedi. API 3001 portunda çalışıyor mu?',
  'errors.nicknameTooShort': 'Takma ad en az {min} karakter olmalı.',
  'errors.nicknameTooLong': 'Takma ad en fazla {max} karakter olabilir.',
  'errors.invalidRoomCode': 'Oda kodu {length} harf olmalı (I ve O hiç kullanılmaz).',
  'errors.invalidPlayerId': 'Oyuncu kimliği UUID olmalı.',
  'errors.invalidLocale': 'Desteklenen bir dil seç.',
  'errors.invalidTargetScore': 'Hedef puan {min} ile {max} arasında olmalı.',
  'errors.invalidCardId': 'Bu kart kimliği geçersiz.',
  'errors.invalidSubmissionId': 'Bu oynama kimliği geçersiz.',
  'errors.notHost': 'Bunu sadece kurucu yapabilir.',
  'errors.notJudge': 'Bunu sadece bu elin jürisi yapabilir.',
  'errors.judgeCannotSubmit': 'Jüri bu elde kart oynamaz.',
  'errors.wrongPhase': 'Şu anda bunu yapamazsın.',
  'errors.alreadySubmitted': 'Bu elde zaten oynadın.',
  'errors.cardNotInHand': 'O kart elinde değil.',
  'errors.wrongPickCount': 'Bu soru tam {pick} kart istiyor.',
  'errors.duplicateCards': 'Aynı kartı iki kez oynayamazsın.',
  'errors.submissionNotFound': 'O oynama artık masada değil.',
  'errors.notEnoughPlayers': 'En az {min} bağlı oyuncu gerekiyor.',
  'errors.noRoundInProgress': 'Devam eden bir el yok.',
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en: EN, tr: TR };

export type TranslationParams = Readonly<Record<string, string | number>>;

export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && value in EN;
}

/** Fills `{name}` placeholders; an unknown placeholder is left alone. */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: TranslationParams,
): string {
  const template = MESSAGES[locale][key];

  if (params === undefined) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Every key, for a quick completeness check in tooling. */
export function messageKeys(): readonly MessageKey[] {
  return Object.keys(EN) as MessageKey[];
}
