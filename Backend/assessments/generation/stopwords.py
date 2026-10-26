"""Stopword lists used for language detection and key-phrase extraction.

Kept short on purpose: they only need to cover the function words that would
otherwise be picked up as key terms.
"""

ENGLISH = frozenset(
    """
    a about above after again against all also am an and any are as at be because been
    before being below between both but by can could did do does doing done down during
    each either else even ever every few for from further had has have having he her here
    hers herself him himself his how however i if in into is it its itself just least less
    let like made make makes many may me might more most much must my myself neither no
    nor not now of off often on once one only or other others our ours ourselves out over
    own per quite rather same several shall she should since so some such than that the
    their theirs them themselves then there these they this those though through thus to
    too under until up upon us use used uses using usually very via was we well were what
    when where whether which while who whom whose why will with within without would yet
    you your yours yourself yourselves its also new first second third two three four five
    called known based different important main many various way ways often generally
    example examples e.g i.e etc
    """.split()
)

FRENCH = frozenset(
    """
    a à afin ai aie aient ainsi alors as assez au aucun aucune aujourd aujourd'hui auquel
    aussi autre autres aux auxquelles auxquels avait avant avec avoir ayant c ça car ce ceci
    cela celle celles celui cependant certain certaine certaines certains ces cet cette ceux
    chacun chaque chez ci comme comment d dans de des desquelles desquels dès donc dont du
    duquel durant elle elles en encore entre es est et étaient était étant été être eu eux
    fait faire fois font hors il ils j je jusqu jusque l la laquelle le lequel les lesquelles
    lesquels leur leurs lors lorsque lui m ma mais me même mêmes mes moi moins mon n ne ni
    non nos notre nous on ont ou où par parce parmi pas peu peut peuvent plus plusieurs
    pour pourquoi pouvant puis qu quand que quel quelle quelles quels qui quoi s sa sans se
    selon ses si sinon soi soit son sont sous souvent suis sur t ta tandis te tel telle
    telles tels tes toi ton tous tout toute toutes très tu un une unes uns vers via vos votre
    vous y ici là cela ceux également ensuite enfin notamment permet permettent utilise
    utilisé utilisée utilisées utilisés utiliser exemple exemples deux trois quatre cinq
    premier première second seconde différents différentes important importante principal
    principale principaux principales manière façon général généralement etc
    """.split()
)

# Words that are frequent in course material but make poor quiz answers.
GENERIC = frozenset(
    """
    chapter section part page figure table course lesson introduction conclusion summary
    example thing things case cases type types kind kinds number numbers time way
    chapitre partie page figure tableau cours leçon introduction conclusion résumé exemple
    chose choses cas type types sorte nombre fois manière façon ensemble élément éléments
    """.split()
)

# Function words allowed inside a multi-word key phrase ("rate of learning",
# "réseau de neurones", "descente du gradient").
CONNECTORS = frozenset({"of", "de", "du", "des", "d", "la", "le", "l", "à", "en", "for"})

# Words that usually come right before a noun. A candidate seen at least once
# after one of them (or as a sentence subject) is treated as a noun phrase,
# which filters out verbs such as "compute" or "apprendre".
NOUN_MARKERS = frozenset(
    """
    the a an this these those its their our your his her each every any some of in on by
    with from into between about during without than per
    le la les l un une des du au aux ce cet cette ces son sa ses leur leurs notre nos
    votre vos chaque plusieurs certains certaines par avec sur dans sans entre
    """.split()
)

BY_LANGUAGE = {"en": ENGLISH, "fr": FRENCH}
ALL = ENGLISH | FRENCH
