
# Developer Notes

- original idea was to have a markdown AST *intermediate* layer 'post-process' site-internal links so that **shortened and/or slightly mistyped** `[[xyz]]` wiki-like links and others would be easily matched up to the actual page **titles** (not the page file names per se!).

  That's not the smartest way to do this, as then I'ld get into trouble with any **raw HTML links** that are done in HTML templates and other bits of site that do *not* travel through the MarkDown engine (direct HTML pages, for example).

  Hence it is *smarter* to *first* generate all HTML, *then* parse that HTML and pluck all the "local" links from there and update them where necessary. That way, *everything* gets linked up the way I intended.

- original idea was to auto-link these references to the **approximate matching** titles/pages when the match is deemed *unique*.

  Still is the way I want it, but auto-linking *should* go through a transformation layer where we:

  + dump any new "auto-discovered" link relationships (reference -> title / page) are dumped in a mapping file, **to be vetted by a human**
  + the tool picks up said mapping file (or the veetted version thereof: jury's still out on that one) and applies that to the links+pages collection.

  Reasoning: auto-linking is *cute*, but MUST NOT cause missing links to be resolved to pages we do not wanted them to link to.
  Hence the tool should have a "manual vetting + overriding" meechanism where the human can clearly decide what is okay and what is *not*.
  
