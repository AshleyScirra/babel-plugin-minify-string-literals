# babel-plugin-minify-string-literals

This plugin deduplicates string literals, creating short local variable definitions for them instead.

Note this can actually increase the gzip size! See below for more.

## Basic functionality
```
function test()
{
    console.log(["example-long-string", "example-long-string", "example-long-string"]);
};
```
transforms to:
```
function test()
{
    const _ = "example-long-string";
    console.log([_, _, _]);
};
```

(That's 111 chars to 89 - but the difference is often reversed by gzip, see below.)

Strings are only deduplicated if it saves characters. There is no need to specify a minimum string length; the plugin calculates the saving based on the length of the chosen identifier, the length of the string literal, and the number of occurrences of the string literal, and extracts it if the saving is greater than the variable declaration that would be added. This means even the empty string `""` can in some circumstances be deduplicated if it can get a single-character identifier. The plugin sorts all string literals by shortest first and deduplicates them in that order to help make it possible to deduplicate shorter strings.

### Approach to processing the script

Declaring `const` variables at the top-level of the script is potentially problematic in cases where scripts are concatenated together. This is commonly done as a build step and top-level variable names could collide.

To avoid this, the plugin processes the top-level blocks in the script, and inserts `const` variables at the top of the scope. For example:

```
// not deduplicated - at top level
console.log(["some long strings", ...]);

(function ()
{
    // deduplicated, because this IIFE is a top-level scope
    console.log(["some long strings", ...]);
})();

{
    // deduplicated, because this is also a top-level scope
    console.log(["some long strings", ...]);
}
```

This means the plugin is always safe to apply. In browser development it's very common to use a file-level IIFE or scope, which makes this approach effective. (This probably isn't the optimal approach for modules which have their own scope at the top level - that's a TODO)

## Interaction with name mangler
[babel-plugin-minify-mangle-names](https://github.com/babel/babili/tree/master/packages/babel-plugin-minify-mangle-names) does local variable renaming, which may affect the local variable names chosen by this plugin. It probably doesn't matter in practice if this is applied before or after string deduplication: if before, then this plugin still chooses short variable names that shorten the script length; if after, it probably helps minify it a bit further.

## Compression results
This plugin tends to shorten the resulting script file by around 1%. However once compressed, the resulting script can **actually be larger!** I was rather surprised to find this. It turns out algorithms like gzip are most effective with longer chunks of repeated text. I guess since this plugin shortens the repeating chunks, it actually makes compression less efficient.

It may still be interesting to apply this plugin for:

* extremely string-heavy scripts (although I haven't measured the performance with that kind of content)
* parse-time optimisation in case it makes a big difference there
* further obfuscation as a way to mitigate reverse-engineering

However if you just want the smallest gzipped size possible, you probably don't want to use this.