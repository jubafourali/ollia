package com.ollia.controller

import com.ollia.dto.CreateUserRequest
import com.ollia.dto.PushTokenRequest
import com.ollia.dto.UpdateUserRequest
import com.ollia.entity.PushToken
import com.ollia.entity.User
import com.ollia.repository.ActivitySignalRepository
import com.ollia.repository.FamilyCircleRepository
import com.ollia.repository.FamilyInviteRepository
import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.PushTokenRepository
import com.ollia.repository.UserRepository
import com.ollia.service.ClerkService
import com.ollia.service.CurrentUserService
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/users")
class UserController(
    private val currentUserService: CurrentUserService,
    private val clerkService: ClerkService,
    private val userRepository: UserRepository,
    private val pushTokenRepository: PushTokenRepository,
    private val activitySignalRepository: ActivitySignalRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val familyInviteRepository: FamilyInviteRepository,
    private val familyCircleRepository: FamilyCircleRepository
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @PostMapping
    fun createOrUpdateUser(@RequestBody request: CreateUserRequest): Map<String, Any> {
        logger.info("Creating or updating user")
        val clerkId = currentUserService.getClerkId()
        userRepository.upsertByClerkId(
            id = java.util.UUID.randomUUID().toString(),
            clerkId = clerkId,
            name = request.name,
            email = request.email
        )
        val user = userRepository.findByClerkId(clerkId)!!
        if (request.region != null) {
            user.region = request.region
            userRepository.save(user)
        }
        return mapOf("id" to user.id!!, "name" to user.name, "email" to user.email)
    }

    @PatchMapping("/me")
    fun updateUser(@RequestBody request: UpdateUserRequest): Map<String, Any> {
        logger.info("Updating user")
        val user = currentUserService.getCurrentUser()
        if (request.name != null) user.name = request.name
        if (request.region != null) user.region = request.region
        val saved = userRepository.save(user)
        return mapOf("id" to saved.id!!, "name" to saved.name, "region" to (saved.region ?: ""))
    }

    @PostMapping("/push-token")
    fun savePushToken(@RequestBody request: PushTokenRequest): Map<String, String> {
        logger.info("Saving push token")
        val user = currentUserService.getCurrentUser()
        var pushToken = pushTokenRepository.findByUserId(user.id!!)
        if (pushToken == null) {
            pushToken = PushToken(userId = user.id!!, token = request.token, platform = request.platform)
        } else {
            pushToken = PushToken(id = pushToken.id, userId = user.id!!, token = request.token, platform = request.platform, createdAt = pushToken.createdAt)
        }
        pushTokenRepository.save(pushToken)
        return mapOf("status" to "saved")
    }

    @DeleteMapping("/me")
    @Transactional
    fun deleteAccount(): ResponseEntity<Void> {
        val user = currentUserService.getCurrentUser()
        val userId = user.id!!
        val clerkId = user.clerkId
        logger.info("Deleting account for user {}", userId)

        // Wipe all DB data in dependency order
        activitySignalRepository.deleteAllByUserId(userId)
        pushTokenRepository.deleteAllByUserId(userId)
        familyMemberRepository.deleteAllByUserId(userId)
        familyInviteRepository.deleteAllByCreatedBy(userId)
        familyCircleRepository.deleteAllByOwnerId(userId)
        userRepository.delete(user)

        // Clerk deletion runs async — response returns immediately after DB commit
        clerkService.deleteUserAsync(clerkId)

        return ResponseEntity.noContent().build()
    }
}
