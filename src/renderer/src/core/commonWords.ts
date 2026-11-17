/**
 * Từ chức năng và từ rất cơ bản — bỏ qua khi trích từ vựng từ đoạn văn.
 * Gồm cả dạng bất quy tắc của các động từ thông dụng (went, made, …).
 */
const LIST = `
a an the this that these those there here what which who whom whose when where why how
i me my mine myself you your yours yourself yourselves he him his himself she her hers herself
it its itself we us our ours ourselves they them their theirs themselves one ones
be am is are was were been being do does did done doing have has had having
will would shall should can could may might must ought
not no nor yes yeah ok okay oh hi hello hey bye please thanks thank sorry
and or but so if then than because as while although though until unless since whether
of to in on at by for with from about into onto over under up down out off through
after before between among around along across against without within during upon
near behind above below beside toward towards per via
all any some many much more most few less least lot lots each every both either neither
other another such same own only just also too very quite really still even ever never
again already always often sometimes usually soon now today tonight tomorrow yesterday
once twice almost enough maybe perhaps probably sure well better best worse worst
how however therefore thus anyway instead else rather indeed
zero one two three four five six seven eight nine ten eleven twelve twenty thirty
hundred thousand million first second third last next half
go goes went gone going come came coming get got gotten getting make made making
take took taken taking give gave given giving see saw seen seeing know knew known
think thought say said says tell told ask asked find found look looked looking
want wanted need needed use used using try tried work worked working call called
feel felt keep kept let put seem seemed leave left mean meant run ran begin began begun
show showed shown hear heard play played move moved live lived believe bring brought
happen happened write wrote written sit sat stand stood lose lost pay paid meet met
include included set learn learned learnt change changed lead led understand understood
watch watched follow followed stop stopped speak spoke spoken read buy bought
send sent build built stay stayed fall fell fallen cut reach kill remain remained
open opened walk walked win won offer offered remember remembered love loved
consider appear appeared wait waited serve served die died grow grew grown
eat ate eaten drink drank sleep slept swim swam fly flew flown drive drove driven
sing sang sung wear wore worn break broke broken choose chose chosen forget forgot
like liked help helped start started turn turned talk talked add added hold held
saying trying telling thinking talking calling asking putting sitting standing playing walking
eating drinking sleeping running reading writing watching waiting staying helping starting turning
thing things people person man men woman women child children kid kids boy girl
friend family mother father mom dad baby brother sister wife husband son daughter
time times day days week month year years hour minute night morning evening afternoon
way part place case point fact world life home house room school book door water food
money car city country game name word words number side head hand hands eye eyes face
body job end line group problem question idea story business area kind sort type
big small little large long short high low old new young good bad great nice fine
right wrong true false real easy hard able free full own sure clear different important
same early late happy sad hot cold warm cool open close black white red blue green
yellow brown gray grey dark light
also back away here there together alone yet ago later
mr mrs ms dr etc
`

export const COMMON_WORDS: ReadonlySet<string> = new Set(LIST.split(/\s+/).filter(Boolean))
