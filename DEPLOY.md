# E Daniel portfolio (version 37): how to put it online

## What is in the zips
Unzip ALL the zip files into ONE folder (they add to each other):
- 1-app: the website (public/), the backend (netlify/functions), netlify.toml, package.json, this guide
- 2-videos-A and 3-videos-B: the reel videos (public/videos). Two parts only because of the 30 MB upload limit.

Folder layout after unzipping
  public/            the website, /admin/ (dashboard) and /admin/editor.html (editor)
  netlify/functions/ the backend: login, visitors, pledges, forms, coins, content, uploads
  netlify.toml, package.json

## Two ways to publish
A) Website only (quick, no backend): zip the CONTENTS of public/ (index.html at the top level) and drop it on Netlify Drop.
   The site works fully: guards, games, languages, selfie looks. Admin, forms saved to your dashboard, and coin approval
   need the backend and will say "server not reachable".
B) Whole thing with the backend (recommended): put the unzipped folder in a GitHub repository (the GitHub web page
   "Add file > Upload files" works from a phone), then in Netlify choose "Import from Git" and pick that repository.
   Or run  netlify deploy --prod --build  inside the folder.

## After the first full deploy
1. Netlify > Project configuration > Environment variables > add ADMIN_PASSWORD (8+ characters, only you know it).
   Never send this password to anyone, including in a chat. Deploy again after changing it.
2. Open  your-site.netlify.app/admin/  and sign in. Editor: /admin/editor.html.

## New in version 36
- Four guards (lion, dragon, turtle, husky) each have their own games, medicines, costumes and talk-back voice.
- Poems and the story are available in Tamil, Kannada, Hindi and Telugu. The robot, the pet room, the games and the
  forms speak the chosen language. Translations are machine-assisted: please read them once. Every poem and story
  has optional translation fields in the editor, and words can be changed in the Language tab.
- Selfie looks: "Clear portrait", "Cartoon" and "Ghibli paint". These are filters that run on the phone (edges, colour
  bands, ink and paint layers). They are not an AI model, so results vary with the photo.
- Bio and hire downloads ask for name, company, number and email (all four required). Other fields are optional.
  They appear in Admin > People.
- Coins: visitors can buy coins for the pet shop with UPI. UPI_ID is set near the top of the pet-care block in
  js/chat.js (currently e.daniel@fam). Payments are NOT checked automatically: the visitor sends the money and a
  reference, and you approve it in Admin > Money, then the coins arrive. COIN_PACKS (amounts) live in js/data.js and
  are mirrored in netlify/functions/coins.mts. A web page cannot use Play Store or App Store in-app purchases.

## New in version 37
- Guards now start as babies and grow with every pet-care level (Level 1 newborn, up to a fully grown guard at Level 8):
  the lion cub gets its mane, the dragon its wings and horns, the husky pup its long legs. A level-up toast names the new stage.
- Lion: the extra hair line under the eye is gone, the tail tuft is redrawn, and a sleeping lion (and husky) now lies with its
  front paws stretched forward and its hind paw tucked in, instead of having no legs.
- Husky: the red collar now wraps the neck properly (cut by the neck outline, fur over its edges); scarf and bandana sit on it.
- The guard ring around the robot is smaller.
- The robot now answers "sry", "srry", "sorryyy", "my bad", "maaf", and the Tamil, Kannada, Hindi and Telugu words for sorry,
  even in the first seconds of a time-out (it forgives after three calm seconds).
- When someone is rude or violent to the robot, ALL guards run in beside it, each with its own sound and its own spoken voice
  (roar, fire, bark, a turtle's squeak). They are heard even if the robot itself was told to be quiet (pet sound must be on).
- Owner editor (/admin/editor.html) has four new tabs: Look & feel (colours, font, effects such as snow and sparkles),
  Voice & sound, Music (import songs from your phone; visitors get a small music button that starts only when tapped),
  and Pets (switch any built-in guard off, add alternate pets with a picture, a hello line and a voice style).
  Alternate pets walk beside the robot and shout when it is mistreated. They do not have a pet room.
- Songs are limited to 5 MB each (12 songs). Pet pictures to 2 MB.

## Still to come (not in this version)
Unique bath tools with visible dirt and foam, a different drink and drinking style for each guard, cooked / hand-fed meals,
a different dance for each guard, colour choices in dress-up, new games for the lantern, bubble and balloon slots, and game levels
(gem slide and snow tower levels). Ask for them and they will be added next.

## Honest limits
- The backend was tested here with a simulated Netlify, not on a live Netlify site.
- Site content such as reel descriptions, certificate captions, experience and artist captions stays in English.
- Followers, age, gender and location are never guessed. Everything is what the visitor types, and anyone who says they
  are under 18 is never asked for, or stored with, a name or contact.
- Visits are counted without names or IP addresses. Add ?notrack to the address once in your own browser to skip your visits.
