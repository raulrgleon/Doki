/* eslint-disable no-unused-vars */
const DokiBrain = (() => {
  const ACTIONS = ['wiggle', 'spin', 'jump', 'bark', 'zoom', null];

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function randomAction() {
    return pick(ACTIONS);
  }

  function parseScore(scoreStr) {
    if (!scoreStr) return null;
    const [h, a] = scoreStr.split('-').map((n) => parseInt(n, 10));
    return { home: h, away: a, total: h + a };
  }

  function scoreLines(result) {
    const s = parseScore(result.score);
    if (!s) return [];
    const winner =
      s.home > s.away ? result.home : s.away > s.home ? result.away : null;
    const lines = [];

    if (result.status === 'live') {
      lines.push(
        {
          quote: `¡Silbato en juego! ${result.home} ${result.score} ${result.away}`,
          hint: 'Doki tiene el VAR en la ventana del auto. Revisión de olfato en curso.',
          action: 'bark',
        },
        {
          quote: 'Doki no parpadea. Modo partido en vivo.',
          hint: `${result.score} y él sigue sin entender el offside.`,
          action: 'jump',
        }
      );
      return lines;
    }

    if (winner) {
      lines.push(
        {
          quote: `Doki vio el ${result.score}: ${winner} se llevó el hueso`,
          hint: 'Ganador confirmado. Perdedor a lamer la herida (con cariño).',
          action: 'bark',
        },
        {
          quote: `${winner} ganó ${result.score}. Doki aplaude con las orejas`,
          hint: 'El fútbol es cruel. Doki es tierno. Equilibrio perfecto.',
          action: 'zoom',
        }
      );
    } else {
      lines.push(
        {
          quote: `Empate ${result.score}. Doki reparte mimos a ambos`,
          hint: 'Nadie gana, nadie pierde. Solo más ansiedad para el próximo.',
          action: 'wiggle',
        },
        {
          quote: `${result.home} y ${result.away} empataron ${result.score}`,
          hint: 'Doki dice: empate técnico en patitas cruzadas.',
          action: null,
        }
      );
    }

    if (s.total >= 5) {
      lines.push({
        quote: `¡${result.score}! Doki pidió goles y le hicieron caso`,
        hint: 'Partidazo. La pelota pidió asilo en la red.',
        action: 'spin',
      });
    }

    if (s.total === 0) {
      lines.push({
        quote: `0-0. Doki aburre pero respeta al arquero`,
        hint: 'Sin goles. Mucho ladrido, poca red.',
        action: null,
      });
    }

    return lines;
  }

  const COUNTRY_LINES = {
    argentina: [
      { quote: 'Doki cree en la Scaloneta', hint: 'La cola ya hace la ola albiceleste 🇦🇷', action: 'wiggle' },
      { quote: 'Si juega Messi, Doki no se mueve del auto', hint: 'Palco VIP = ventana trasera. Reglas claras.', action: 'zoom' },
      { quote: 'Argentina en el filtro. Doki exige título', hint: 'No es presión. Es fe canina.', action: 'bark' },
    ],
    spain: [
      { quote: 'Doki aprueba la Roja', hint: 'Tiki-taka canino en modo espera 🇪🇸', action: 'spin' },
      { quote: 'La Roja juega y Doki ladra en castellano', hint: 'Olé, patitas, olé.', action: 'wiggle' },
    ],
    uruguay: [
      { quote: 'Doki respeta a La Celeste', hint: 'Garra, mate y ventana del auto 🇺🇾', action: 'jump' },
      { quote: 'Uruguay en pantalla. Modo garra activado', hint: 'Pequeño en mapa, grande en corazón canino.', action: 'bark' },
    ],
  };

  const TAP_LINES = [
    { quote: 'Patitas cruzadas hasta el pitido', hint: 'No es ansiedad. Es fútbol internacional.', action: 'wiggle' },
    { quote: 'Si suena el silbato, ladra', hint: 'Es su VAR personal. Revisión en curso.', action: 'bark' },
    { quote: 'Ventana del auto = palco VIP', hint: 'Entradas agotadas. Él llegó primero.', action: 'zoom' },
    { quote: 'Doki no entiende el offside', hint: 'Pero confía en Messi. Prioridades.', action: 'spin' },
    { quote: '¿Eliminatorias? Doki dice que sí', hint: 'Aunque no sepa quién juega todavía.', action: 'jump' },
    { quote: 'Modo espera: cola en standby', hint: 'Pelota en standby. Humanos en pánico.', action: 'wiggle' },
    { quote: 'Doki exportó el calendario al iPhone', hint: 'Por si su humano se pierde un partido. Jamás.', action: null },
    { quote: 'Hoy hay fútbol y Doki lo sabe', hint: 'Nariz al aire. Olfato a goles.', action: 'bark' },
  ];

  function forCountry(country) {
    if (COUNTRY_LINES[country]) return pick(COUNTRY_LINES[country]);
    return null;
  }

  function forNextMatch(next) {
    if (!next) return null;
    return {
      quote: `Próximo: ${next.teams}`,
      hint: `${next.when} · ${next.venue}. Doki ya reservó ventana.`,
      action: 'wiggle',
    };
  }

  function generate(trigger, context) {
    const recent = context.recentResults || [];
    const live = recent.find((r) => r.status === 'live');
    const lastFinished = recent.find((r) => r.status === 'finished');

    if (trigger === 'score_update' && (live || lastFinished)) {
      const lines = scoreLines(live || lastFinished);
      if (lines.length) return pick(lines);
    }

    if (live && trigger !== 'tap') {
      const lines = scoreLines(live);
      if (lines.length) return pick(lines);
    }

    if (lastFinished && (trigger === 'auto' || trigger === 'context')) {
      const lines = scoreLines(lastFinished);
      if (lines.length && Math.random() > 0.35) return pick(lines);
    }

    const countryLine = forCountry(context.activeCountry);
    if (countryLine && (trigger === 'context' || Math.random() > 0.5)) {
      return countryLine;
    }

    const nextLine = forNextMatch(context.nextMatch);
    if (nextLine && trigger === 'auto' && Math.random() > 0.55) {
      return nextLine;
    }

    if (trigger === 'tap') {
      return pick(TAP_LINES);
    }

    if (context.finishedCount > 0) {
      return {
        quote: `Ya van ${context.finishedCount} partidos con resultado`,
        hint: 'Doki lleva la cuenta. Con las patas. Mal, pero con entusiasmo.',
        action: randomAction(),
      };
    }

    return {
      quote: 'Doki esperando los partidos',
      hint: '104 partidos. Cero paciencia. Mucha ventana.',
      action: 'wiggle',
    };
  }

  return { generate };
})();
