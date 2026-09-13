/**
 * Browser bonus-round helpers (mirrors bonus-round.cjs).
 */
(function bonusRoundBrowser() {
  const BONUS_POINTS = 75;
  const BONUS_TIMER_SEC = 30;
  const BONUS_WRONG_COUNT = 3;
  const BONUS_INTERVAL = 4;
  const PRACTICE_FIRST_BONUS_AT = 2;
  const ONLINE_FIRST_BONUS_AT = 4;

  function firstBonusAt(mode) {
    return mode === "online" ? ONLINE_FIRST_BONUS_AT : PRACTICE_FIRST_BONUS_AT;
  }

  function shouldTriggerBonus(totalSubmits, mode) {
    const first = firstBonusAt(mode);
    if (totalSubmits < first) {
      return false;
    }
    if (totalSubmits === first) {
      return true;
    }
    return (totalSubmits - first) % BONUS_INTERVAL === 0;
  }

  function shuffleInPlace(list, random) {
    const rng = random || Math.random;
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function pickDistractors(countryKey, countries, random) {
    const entry = countries[countryKey];
    if (!entry) {
      return [];
    }
    const pool = [];
    if (Array.isArray(entry.islandDistractors) && entry.islandDistractors.length) {
      pool.push(...entry.islandDistractors);
    } else if (Array.isArray(entry.neighbors) && entry.neighbors.length) {
      pool.push(...entry.neighbors);
    }
    if (Array.isArray(entry.fallbackNearby)) {
      pool.push(...entry.fallbackNearby);
    }
    const unique = [...new Set(pool.filter((key) => key && key !== countryKey && countries[key]))];
    shuffleInPlace(unique, random);
    return unique.slice(0, BONUS_WRONG_COUNT);
  }

  function generateBonusQuestion(countryData, random) {
    const rng = random || Math.random;
    const keys = Object.keys(countryData.countries || {});
    if (!keys.length) {
      throw new Error("No bonus country data.");
    }
    let answerKey = keys[Math.floor(rng() * keys.length)];
    let distractors = pickDistractors(answerKey, countryData.countries, rng);
    let attempts = 0;
    while (distractors.length < BONUS_WRONG_COUNT && attempts < 40) {
      answerKey = keys[Math.floor(rng() * keys.length)];
      distractors = pickDistractors(answerKey, countryData.countries, rng);
      attempts += 1;
    }
    if (distractors.length < BONUS_WRONG_COUNT) {
      const filler = keys.filter((key) => key !== answerKey && !distractors.includes(key));
      shuffleInPlace(filler, rng);
      while (distractors.length < BONUS_WRONG_COUNT && filler.length) {
        distractors.push(filler.pop());
      }
    }
    if (distractors.length < BONUS_WRONG_COUNT) {
      throw new Error("Could not build bonus choices.");
    }
    const answer = countryData.countries[answerKey];
    const choices = shuffleInPlace([answerKey, ...distractors.slice(0, BONUS_WRONG_COUNT)], rng);
    return {
      countryKey: answerKey,
      countryName: answer.name,
      lat: answer.lat,
      lng: answer.lng,
      choices: choices.map((key) => ({
        key,
        name: countryData.countries[key].name
      })),
      correctIndex: choices.indexOf(answerKey)
    };
  }

  function scoreBonusAnswer(question, choiceIndex) {
    return Number(choiceIndex) === Number(question.correctIndex) ? BONUS_POINTS : 0;
  }

  window.GlobbleBonusRound = {
    BONUS_POINTS,
    BONUS_TIMER_SEC,
    BONUS_INTERVAL,
    firstBonusAt,
    shouldTriggerBonus,
    generateBonusQuestion,
    scoreBonusAnswer
  };
})();
