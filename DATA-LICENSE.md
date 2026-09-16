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
- deriving provisional roles and conservative placement-based ratings where verified
  individual statistics are unavailable; and
- adding two independently curated pre-Major Legacy cards.

The source-code license does not override this dataset license.

## Organization logos

The image files under `public/logos/` are organization logos retrieved through Liquipedia.
They are trademarks and copyrighted works of the respective organizations, are **not**
covered by the CC BY-SA 3.0 license above, and are not licensed onward by this project.
They are included solely to identify each historical roster in a non-commercial fan
project, and are removed on request by the rights holder. No player photos are included.
