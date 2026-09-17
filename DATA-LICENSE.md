# Dataset license and attribution

The Major, roster, participant, coach, placement, and source metadata committed under
`src/data/json/` is adapted from [Liquipedia Counter-Strike](https://liquipedia.net/counterstrike).
Liquipedia contributors provide that source material under the
[Creative Commons Attribution-ShareAlike 3.0 United States license](https://creativecommons.org/licenses/by-sa/3.0/us/).

The adapted dataset is distributed under the same CC BY-SA 3.0 terms. Individual Major
records retain their source page URL, pinned revision ID, and access date. The import and
normalization process is documented in [`docs/DATA.md`](docs/DATA.md).

Changes made by Major Winners include:

- selecting only teams and players that participated in each Major;
- normalizing organization, player, roster, and coach identifiers;
- combining roster appearances into player-org-season records;
- deriving player roles from career AWP/IGL identity and roster uniqueness, with TeamCard
  listing order only as a weak prior, a committed curated overlay for exceptions, and
  conservative placement-based ratings where verified individual statistics are unavailable;
- deriving coach modifiers from Major placement (champion through field-floor) so every
  coach card grants at least one tactical bonus, while preserving a few hand-tuned rows;
- transcribing individual season statistics from HLTV year-filtered player pages
  (those numbers are not Liquipedia material); and
- adding two independently curated pre-Major Legacy cards.

The source-code license does not override this dataset license.

## Organization logos, Major logos, and player photos

The image files under `public/logos/` (including `public/logos/majors/`) and
`public/photos/players/` are organization marks, tournament marks, and official HLTV
player portraits retrieved through Liquipedia or year-filtered HLTV stats pages. They are
trademarks and copyrighted works of the respective organizations and photographers, are
**not** covered by the CC BY-SA 3.0 license above, and are not licensed onward by this
project. They are included solely to identify historical rosters, Majors, and
player-seasons in a non-commercial fan project, and are removed on request by the rights
holder.
