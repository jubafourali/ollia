package com.ollia.service

import com.ollia.entity.User
import com.ollia.repository.UserRepository
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import java.time.ZoneOffset
import java.util.UUID

@Service
class CurrentUserService(private val userRepository: UserRepository) {
    companion object {
        const val FOUNDING_MEMBER_LIMIT = 100L
        const val FOUNDING_PERK_MONTHS = 6L
    }

    fun getClerkId(): String {
        val jwt = SecurityContextHolder.getContext().authentication.principal as Jwt
        return jwt.subject
    }

fun getCurrentUser(): User {
        val clerkId = getClerkId()
        return userRepository.findByClerkId(clerkId)
            ?: run {
                userRepository.upsertByClerkId(
                    id = UUID.randomUUID().toString(),
                    clerkId = clerkId,
                    name = "User",
                    email = "$clerkId@placeholder.com"
                )
                val user = userRepository.findByClerkId(clerkId)!!
                // Grant founding member status if under the cap
                val totalUsers = userRepository.count()
                if (totalUsers <= FOUNDING_MEMBER_LIMIT) {
                    user.foundingMember = true
                    user.foundingExpiresAt = user.createdAt
                        .atZone(ZoneOffset.UTC)
                        .plusMonths(FOUNDING_PERK_MONTHS)
                        .toInstant()
                    userRepository.save(user)
                }
                user
            }
    }
}
