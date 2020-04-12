# deGaulle

static site generator (SSG) with attitude and control.


## What's it good for?

When you want some guarantees while writing your website pages, *deGaulle* will help out.

You write your website in MarkDown and possible some HTML. Nothing new there. *Mon Général*, however, makes sure you've got everything covered. He takes one (or more) entry points (which you supply to him) into the site and makes absolutely bloody sure all the pages you wrote are **reachable** from at least one of those entry points.

Anything that's *unreachable* from those entry points will get listed.

Also, *deGaulle* will help out in rewriting all the links in your generated pages to ensure your source references (as you wrote them in your MarkDown articles) will translate properly to the final website, whether you use simple or complicated page naming schemes, whether it's a "permalink", "immutable content" or other URI production style.


## Goals

- produce websites which are SEO friendly, fully static where they can be. *Totally google-able, I must be.*
- produce websites which require as little maintenance & anti-hacker supervision as possible: if *you* don't want JavaScript in the result, *deGaulle* is your man.

  > If you wish to inject client-side code, be my guest, but know that we can do without. The goal is to keep the total attack surface as lean & mean as possible. Once published, your attention should allowed to be focused *elsewhere*, until the next site update!
  
- no "opinionated" source directory layout, thank you very much.
- scan a directory tree and process everything in there. Userland code/config will tell us what to do with each, when defaults for type don't suffice.

  > Technically, I want something of a wildcarded [`glob`](https://www.npmjs.com/package/glob) scan of the entire kaboodle and then userland filters can decide what to do, if the *deGaulle* doesn't already do what you want by default.
  
- verify reachability and report any "dangling items" (which Google won't be to find easily)
- find and report all site-internal "unconnected links" (which will produce a 404 in production)
- provide an easy means to *map* source paths to target URIs using userland code: the user must have total flexibility in naming.
  + include duplicate/collision checks and a resolve mechanism
  + *rewrite* all links in the generated HTML, SVG, CSS, etc. 
  
    > Let me elaborate on this one: when you use MarkDown or any other to-HTML transpiler for your materials, these tools will always apply a default transformation for the links in your material. (E.g. converting any `'file.md` reference to `file.html`)
    >
    > *deGaulle* will seek out all links in these transpiled results and *map* them onto the target URIs as produced by your userland URI mapper.
    >
    > This way the entire transpiler process can use any external library (`markdown-it`, etc.) and/or template engine and not have to bother with patching every one of those tools: not all of them will have the required flexibility in their plugins anyway.

- use JavaScript String Templates as the 'template engine of choice'. In fact, each template is a JS module.

  > After all, this is the most powerful and flexible -- and completely native to JS -- template engine available.

- ability to produce multiple output files from single source (and vice versa).

  > This is *not* simply "pagination": one of the targets is a networked tutorial where one file could potentially produce a large *graph* of interconnected pages. Think **interactive storytelling**.




## Causation  

I tried several SSGs, including such different animals as vuepress, wintersmith and eleventy, but ultimately the problem with each is that, in order to achive my goals, I had to dig down *deep* into the core of those frameworks/generators and was lossing quite a bit of time while the results were... sub-par at best. 

> Quite possibly some large chunks of this work can be imported into eleventy (which came closest to what I'd like). When the time comes, we'll see if that's an option.


### NIH, y'all?

Given the Goals set above, this sounds a lot like a redo of eleventy (with some particular sprinkles on top), and unfortunately it is. But after spending some serious time with eleventy, I think I will be faster rolling my own than hacking in the internals of eleventy as that  one has flexibilities and consequent code complexities that I don't want or need: *deGaulle* is not targeting **site migration** but is primarily aimed at **new site construction**. If *deGaulle* is useful for migrating another site, that's nice, but only a happy coincidence.





## Technology

### MarkDown? `markdown-it`!

The most important component will be the MarkDown transpiler. `markdown-it` is my all-time favorite. Added benefit for me there is that it can be augmented to a feature set that has almost anything you can dream up.

### Eleventy? Geeking out on `async`? ES6/2015+?
### And the template Engine...?

As this is going to be a tool that's quite similar to eleventy, do we also go "async all the way"? Maybe, when the need arises, but this is not a latest-JS-language-features-testbed but a tool that should deliver usable output ASAP, while I believe most of the 'async' in eleventy is there to allow for flexibility in what you jack into it for a template engine, source provider, etc., which is not a flexibility that I seek with *deGaulle*: it's `markdown-it` and Javascript Modules/Template Strings for now and given my previous use of various template libraries in JavaScript, I don't see any pressing need to use those, now that JavaScript Template Strings are totally mainstream and supported by all modern NodeJS and browser incantations.

### SPA? SSR? \<Insert BuzzAcronym here />

Oh, and do we get an SPA, like you would with the likes of `vuepress`? Let me quote *mon Général* on that: **"Non!"** 

If you want an SPA with added SEO friendliness, you can checkout vuepress, but I specifically abandoned that one as it produces a shitload of JavaScript that I don't want or need: I'm not looking for hipster creds either here: *deGaulle* is a conservative bugger which produces sites that *work* and which are *simple* in their execution: 

### SASS? Stylus? LESS? PostCSS?

Re CSS we are not so sure yet. While I personally like LESS, SASS is the one with the largest market share. Meanwhile I cringle when [CSS3 variables](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties) appear, because it feels the committee has been hard at work to work around existing libraries (SASS, LESS) and make it all "interoperable". Of course it's not OSS politically safe or survivable to come up with something that blows one or two of the major buggers out of the water, but what the heck?! A `--` prefix? That one has a track record of nearly **50! yes! _fifty_ years** of "pre-decrement operator" to it, without interruption, right into current-day JavaScript and plenty elsewhere too. Cripes! Cognitive dissonance is my share every time I look at one! [Thank you, my W3C CSS3 heroes!](https://www.w3.org/Style/CSS/members)

*\*Okay...\** 

So what about [doing it with PostCSS](https://ashleynolan.co.uk/blog/postcss-a-review) (which is what a lot of others use, including and beyond the very handy 'autoprefixer')? SASS + PostCSS maybe? [Or some transitional form of that?](https://css-tricks.com/from-sass-to-postcss/) 

At the time of this writing, the decision is "inconclusive". Anyway, there's several SASS/Stylus/LESS loaders for PostCSS, so that's probably going to be our route as well.









