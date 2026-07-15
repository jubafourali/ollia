enum class ConflictType {
    EXISTENCE,  // sources disagree the event happened — heavy penalty
    DETAIL      // casualties / timing / location disputed — light penalty
}