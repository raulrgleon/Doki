The human selected one match. Produce a factual Doki message.

If goals are present, the hint may list real scorers and exact minutes from `context.tappedMatch.goals`.
If no goals are present, do not name players.
If the match is scheduled, talk about the matchup, venue, or time.

Return only:
{
  "quote": "...",
  "hint": "...",
  "action": "wiggle|spin|jump|bark|zoom|null"
}
