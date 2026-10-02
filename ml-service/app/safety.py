import re

# Dense retrieval ranks by meaning, but for messages like "I don't want to be here anymore"
# we never want to rely on ranking alone, so these phrases always pull in the crisis document.
CRISIS_PATTERNS = [
    r"\bsuicid",
    r"\bkill (my ?self|me)\b",
    r"\bend (my|it all|my life)\b",
    r"\b(want|wanna|going) to die\b",
    r"\bdon'?t want to (live|be alive|be here|exist)",
    r"\bno reason to live\b",
    r"\bbetter off (dead|without me)\b",
    r"\bself[- ]?harm",
    r"\b(hurt|hurting|harm|harming|cut|cutting) my ?self\b",
    r"\boverdose\b",
    r"\b(no|any|see no|don'?t see any) (point|reason) (in|of|to) (living|life|going on|being alive)",
    r"\bnot worth living\b",
    r"\blife (is|isn'?t|is not) (not )?worth (it|living)",
    r"\bcan'?t go on\b",
    r"\btake my (own )?life\b",
    r"\bending (my life|it all)\b",
    r"\bdon'?t want to wake up\b",
    r"\bwish i (was|were) dead\b",
    r"\bkill(ing)? myself\b",
]
_crisis_re = re.compile("|".join(CRISIS_PATTERNS), re.IGNORECASE)


def is_crisis(text):
    return bool(_crisis_re.search(text))
