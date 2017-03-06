"use strict";

module.exports = function({ types: t })
{
	return {
		name: "babel-plugin-minify-string-literals",
		pre(state)
		{
			this.stringMap = new Map();		// map of string to array of StringLiteral node paths
			this.blockDepth = -1;			// nest level inside BlockStatement
		},
		visitor:
		{
			BlockStatement: {
				enter(path, state)
				{
					// Track depth inside BlockStatements. Only process top-level ones.
					this.blockDepth++;
					
					if (this.blockDepth > 0)
						return;
					
					// Reset state for this top-level BlockStatement.
					this.stringMap.clear();
				},
				exit(path)
				{
					this.blockDepth--;
					
					if (this.blockDepth >= 0)
						return;		// wait until leaving top-level BlockStatement again
					
					if (this.stringMap.size === 0)
						return;		// no strings to minify
					
					// List of variable declarators to add to this block.
					const declarators = [];

					// Sort the strings so the shortest come first. This is because the first variable
					// names chosen are likely to be the smallest, and shorter strings need the savings
					// the most.
					const sortedStringMap = [...this.stringMap];
					sortedStringMap.sort((a, b) => a[0].length - b[0].length);
					
					let identName = "";		// next declarator identifier name to use
					
					for (const [str, arr] of sortedStringMap)
					{
						if (arr.length === 1)
							continue;		// not worth minifying single string
						
						// Choose an identifier name now, since its length is used in the calculation to
						// determine if it's worth deduplicating it. Note each call to generateUidIdentifier
						// increments the name and we don't know we'll use this name yet, so sometimes the
						// name is left behind for the next iteration.
						if (!identName)
							identName = path.scope.generateUidIdentifier("").name;
						
						// Work out how many characters will be saved by substituting every string literal
						// with the identifier. This saving has to be greater than the overhead of the declarator
						// to be worthwhile. Note we count the quotes around the string literal, and the
						// overhead of the declarator is the identifier plus four characters (i.e. ident="",)
						const saving = ((str.length + 2) - identName.length) * arr.length;
						if (saving <= identName.length + 4 + str.length)
							continue;		// not worth extracting; identName can be re-used next iteration
						
						// Extract this string literal. Create a variable declarator and substitute every
						// string literal node with the identifier.
						declarators.push(t.variableDeclarator(t.identifier(identName), t.stringLiteral(str)));
						
						for (const path of arr)
							path.replaceWith(t.identifier(identName));
						
						// identName has been used, so make sure a new name is picked on the next iteration.
						identName = "";
					}
					
					// If any strings were extracted, add the variable declaration with all the declarators to the block.
					if (declarators.length)
					{
						const declaration = t.variableDeclaration("const", declarators);
						path.unshiftContainer("body", declaration);
					}
				}
			},
			StringLiteral(path)
			{
				if (this.blockDepth < 0)
					return;		// not in a BlockStatement
				
				const node = path.node;
				const value = node.value;
				
				if (path.parentPath.isObjectProperty({ key: node }) ||
					path.parentPath.isMemberExpression() ||
					(path.isLVal() && !path.parentPath.isExpressionStatement()))
				{
					return;
				}
				
				// Add this string literal path to the array of paths for the string.
				let arr = this.stringMap.get(value);
				
				if (typeof arr === "undefined")
				{
					arr = [];
					this.stringMap.set(value, arr);
				}
				
				arr.push(path);
			},
		},
	};
};