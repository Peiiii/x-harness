import { readAX } from "./readers-ax-parser.js";
import { parseAXNodes, createAXTree } from "./readers-ax-tree.js";
import {
  projectAXFilepicker,
  projectAXMedia,
  projectAXNavigation,
  projectAXPeople,
  projectAXPosts,
  projectAXProfile,
  projectAXComposer,
} from "./readers-ax-views.js";
// Explicit serialization closure; the same parser runs in Node and the REPL.
export const axParserCode = `(function(){const parseAXNodes=${parseAXNodes.toString()};const createAXTree=${createAXTree.toString()};const projectAXFilepicker=${projectAXFilepicker.toString()};const projectAXMedia=${projectAXMedia.toString()};const projectAXNavigation=${projectAXNavigation.toString()};const projectAXPeople=${projectAXPeople.toString()};const projectAXPosts=${projectAXPosts.toString()};const projectAXProfile=${projectAXProfile.toString()};const projectAXComposer=${projectAXComposer.toString()};return ${readAX.toString()};})()`;
