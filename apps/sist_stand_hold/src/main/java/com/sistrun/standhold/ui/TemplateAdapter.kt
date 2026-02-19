package com.sistrun.standhold.ui

import android.graphics.Bitmap
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.sistrun.standhold.databinding.ItemTemplateImageBinding

class TemplateAdapter(
    private val onItemClick: (Int) -> Unit,
) : RecyclerView.Adapter<TemplateAdapter.TemplateViewHolder>() {

    data class Item(
        val bitmap: Bitmap,
    )

    private val items = mutableListOf<Item>()
    private var selectedIndex: Int = 0

    fun submit(newItems: List<Item>, selected: Int) {
        items.clear()
        items.addAll(newItems)
        selectedIndex = selected.coerceIn(0, (items.size - 1).coerceAtLeast(0))
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TemplateViewHolder {
        val binding = ItemTemplateImageBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false,
        )
        return TemplateViewHolder(binding)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: TemplateViewHolder, position: Int) {
        holder.bind(items[position], isSelected = position == selectedIndex)
    }

    inner class TemplateViewHolder(
        private val binding: ItemTemplateImageBinding,
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: Item, isSelected: Boolean) {
            binding.templateImageView.setImageBitmap(item.bitmap)

            binding.cardView.strokeWidth = if (isSelected) 4 else 1
            binding.cardView.strokeColor = if (isSelected) {
                0xFF6CCEFF.toInt()
            } else {
                0xFF365D80.toInt()
            }

            binding.root.setOnClickListener {
                onItemClick(bindingAdapterPosition)
            }
        }
    }
}
