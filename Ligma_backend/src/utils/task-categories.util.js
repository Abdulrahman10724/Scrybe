// Categories a canvas node / task can have. "Question" covers open
// questions the team still has to answer. "Information" is the fallback for
// older data and for content that is none of the others; "Reference" is
// assigned when a node contains links (regex, not AI).
const AI_CATEGORIES = ["Action", "Decision", "Question", "Information"];
const TASK_TYPES = ["Action", "Decision", "Question", "Information", "Reference"];

export { AI_CATEGORIES, TASK_TYPES };
