package com.ollia.controller

import com.ollia.dto.FamilyMemberResponse
import com.ollia.dto.FamilyResponse
import com.ollia.dto.InviteResponse
import com.ollia.entity.FamilyCircle
import com.ollia.entity.FamilyInvite
import com.ollia.entity.FamilyMember
import com.ollia.repository.*
import com.ollia.service.CurrentUserService
import com.ollia.service.StatusService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@RestController
@RequestMapping("/api/family")
class FamilyController(
    private val currentUserService: CurrentUserService,
    private val familyCircleRepository: FamilyCircleRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val familyInviteRepository: FamilyInviteRepository,
    private val userRepository: UserRepository,
    private val statusService: StatusService
) {

    @GetMapping
    fun getFamily(): FamilyResponse {
        val user = currentUserService.getCurrentUser()
        val memberships = familyMemberRepository.findAllByUserId(user.id!!)

        val allMembers = memberships.flatMap { membership ->
            familyMemberRepository.findAllByCircleId(membership.circleId)
        }.distinctBy { it.userId }

        val memberResponses = allMembers.mapNotNull { member ->
            val memberUser = userRepository.findById(member.userId).orElse(null) ?: return@mapNotNull null
            FamilyMemberResponse(
                userId = memberUser.id.toString(),
                name = memberUser.name,
                status = statusService.computeStatus(memberUser.lastSeenAt),
                lastSeenAt = memberUser.lastSeenAt
            )
        }

        return FamilyResponse(members = memberResponses)
    }

    @PostMapping("/invite")
    fun createInvite(): InviteResponse {
        val user = currentUserService.getCurrentUser()
        var circle = familyCircleRepository.findByOwnerId(user.id!!)
        if (circle == null) {
            circle = familyCircleRepository.save(FamilyCircle(ownerId = user.id!!))
            familyMemberRepository.save(FamilyMember(circleId = circle.id!!, userId = user.id!!, role = "owner"))
        }

        val token = UUID.randomUUID().toString()
        familyInviteRepository.save(
            FamilyInvite(
                circleId = circle.id!!,
                token = token,
                createdBy = user.id!!,
                expiresAt = Instant.now().plus(7, ChronoUnit.DAYS)
            )
        )

        return InviteResponse(token = token, deepLink = "ollia://invite?token=$token")
    }

    @PostMapping("/invite/{token}/accept")
    fun acceptInvite(@PathVariable token: String): Map<String, String> {
        val user = currentUserService.getCurrentUser()
        val invite = familyInviteRepository.findByToken(token)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Invite not found")

        if (invite.usedAt != null) {
            throw ResponseStatusException(HttpStatus.GONE, "Invite already used")
        }
        if (invite.expiresAt.isBefore(Instant.now())) {
            throw ResponseStatusException(HttpStatus.GONE, "Invite expired")
        }

        val existing = familyMemberRepository.findByCircleIdAndUserId(invite.circleId, user.id!!)
        if (existing != null) {
            return mapOf("status" to "already_member")
        }

        familyMemberRepository.save(FamilyMember(circleId = invite.circleId, userId = user.id!!))
        invite.usedAt = Instant.now()
        invite.usedBy = user.id
        familyInviteRepository.save(invite)

        return mapOf("status" to "joined")
    }
}
